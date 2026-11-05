import { AuthError, SESSION_COOKIE, userForToken, type User } from "./auth";
import { BadRequest } from "./validate";

/**
 * Every API route is built with `route()`. It enforces, in order:
 *  1. same-origin check on state-changing methods (CSRF defence alongside SameSite=Lax)
 *  2. authentication (unless `{ public: true }`), resolving the session cookie to a user
 *  3. uniform error handling that never echoes internals, request bodies or tokens
 *  4. `Cache-Control: no-store` on every response (they carry personal data)
 * tests/authz.test.ts fails the build if any route file bypasses it.
 */

export interface Ctx { user: User; token: string }
type PublicCtx = { user: User | null; token: string | null };

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

/** Rate-limit key for the caller. Only trusts X-Forwarded-For behind a known proxy. */
export function clientKey(req: Request) {
  if (process.env.CALM_TRUST_PROXY === "1") {
    const xf = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (xf) return xf.slice(0, 64);
  }
  return "direct";
}

export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (origin) {
    try { return !!host && new URL(origin).host === host; } catch { return false; }
  }
  // Browsers always send Origin on cross-site POSTs; allow same-origin fetches that omit it.
  return req.headers.get("sec-fetch-site") === "same-origin";
}

export function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function sessionCookie(token: string, expires: Date) {
  const secure = process.env.NODE_ENV === "production" && process.env.CALM_INSECURE_COOKIES !== "1" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${expires.toUTCString()}${secure}`;
}
export function clearedCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

type Handler<C> = (req: Request, ctx: C) => Promise<unknown> | unknown;

export function route(fn: Handler<Ctx>): (req: Request) => Promise<Response>;
export function route(opts: { public: true }, fn: Handler<PublicCtx>): (req: Request) => Promise<Response>;
export function route(a: Handler<Ctx> | { public: true }, b?: Handler<PublicCtx>) {
  const isPublic = typeof a !== "function";
  const fn = (isPublic ? b : a) as Handler<Ctx | PublicCtx>;
  return async (req: Request) => {
    try {
      if (MUTATING.has(req.method) && !sameOrigin(req)) return json({ error: "Cross-site request blocked" }, { status: 403 });
      const token = readCookie(req, SESSION_COOKIE);
      const user = userForToken(token);
      if (!isPublic && !user) return json({ error: "Please sign in" }, { status: 401 });
      const out = await fn(req, { user, token } as Ctx | PublicCtx);
      if (out instanceof Response) {
        out.headers.set("cache-control", "no-store");
        return out;
      }
      return json(out ?? { ok: true });
    } catch (e) {
      if (e instanceof BadRequest) return json({ error: e.message }, { status: 400 });
      if (e instanceof AuthError) return json({ error: e.message }, { status: e.status });
      if (e instanceof SyntaxError) return json({ error: "Invalid JSON" }, { status: 400 });
      // Log the error type and message only — never request bodies, cookies or tokens.
      console.error(`[api] ${req.method} ${new URL(req.url).pathname}:`, e instanceof Error ? `${e.name}: ${e.message}` : "unknown error");
      return json({ error: "Something went wrong" }, { status: 500 });
    }
  };
}
