import crypto from "node:crypto";
import { db, type UserId } from "../db";
import { decryptSecret, encryptSecret, tokenKey } from "../secrets";
import { ingest } from "../signals/store";
import type { IngestReport } from "../signals/types";
import { ProviderHttpError, type OAuthProvider } from "./types";
import { oura } from "./oura";

/**
 * OAuth2 authorization-code flow with PKCE (RFC 7636) and state (RFC 6749 §10.12),
 * following RFC 9700 (OAuth 2.0 Security BCP):
 *  - state: 32 random bytes, single use, bound to the signed-in user + provider, 10 min TTL;
 *    only its SHA-256 is stored
 *  - PKCE S256 verifier: 32 random bytes, stored encrypted until the callback
 *  - exact registered redirect URI, sent again at token exchange
 *  - tokens: AES-256-GCM at rest, never sent to the browser, never logged
 */
export const OAUTH_PROVIDERS: Record<string, OAuthProvider> = { oura };

const STATE_TTL_MS = 10 * 60e3;
const REFRESH_SKEW_MS = 2 * 60e3;
const MAX_PAGES = 50;
const MAX_RETRIES = 3;

export class IntegrationError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}

export type Availability = "available" | "blocked_by_credentials" | "token_key_missing";

/** Whether this server can offer the provider at all (credentials + token key present). */
export function availability(p: OAuthProvider): Availability {
  if (!tokenKey()) return "token_key_missing";
  if (!process.env[p.clientIdEnv] || !process.env[p.clientSecretEnv]) return "blocked_by_credentials";
  return "available";
}

export function providerOr404(id: string) {
  const p = OAUTH_PROVIDERS[id];
  if (!p) throw new IntegrationError("unknown_provider", "Unknown provider", 404);
  return p;
}

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const b64url = (b: Buffer) => b.toString("base64url");
export const pkceChallenge = (verifier: string) => b64url(crypto.createHash("sha256").update(verifier).digest());

/** Step 1: create state + PKCE verifier and return the provider's authorization URL. */
export function beginAuthorization(uid: UserId, p: OAuthProvider, redirectUri: string, now = Date.now()) {
  if (availability(p) !== "available") throw new IntegrationError("not_configured", `${p.name} isn't configured on this server.`);
  const state = b64url(crypto.randomBytes(32));
  const verifier = b64url(crypto.randomBytes(32));
  db().prepare("DELETE FROM oauth_states WHERE expires_at < ?").run(new Date(now).toISOString());
  db().prepare("INSERT INTO oauth_states (state_hash, user_id, provider, verifier_enc, redirect_uri, expires_at) VALUES (?,?,?,?,?,?)")
    .run(sha256(state), uid, p.id, encryptSecret(verifier), redirectUri, new Date(now + STATE_TTL_MS).toISOString());
  const q = new URLSearchParams({ response_type: "code", client_id: process.env[p.clientIdEnv]!, redirect_uri: redirectUri, scope: p.scopes.join(" "), state });
  if (p.pkce) { q.set("code_challenge", pkceChallenge(verifier)); q.set("code_challenge_method", "S256"); }
  return { url: `${p.authorizeUrl}?${q}`, state };
}

interface TokenResponse { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown; scope?: unknown; token_type?: unknown }

async function tokenRequest(p: OAuthProvider, form: Record<string, string>, f: typeof fetch): Promise<TokenResponse> {
  const body = new URLSearchParams({ ...form, client_id: process.env[p.clientIdEnv]!, client_secret: process.env[p.clientSecretEnv]! });
  const res = await f(p.tokenUrl, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body });
  if (!res.ok) throw new ProviderHttpError(res.status, null, `token endpoint ${res.status}`);
  const json = (await res.json()) as TokenResponse;
  if (typeof json.access_token !== "string" || !json.access_token) throw new IntegrationError("bad_token_response", "Provider returned no access token", 502);
  return json;
}

function storeTokens(uid: UserId, p: OAuthProvider, t: TokenResponse, keepRefresh: string | null, now: number) {
  const refresh = typeof t.refresh_token === "string" && t.refresh_token ? t.refresh_token : keepRefresh; // keep old one if not rotated
  const expires = typeof t.expires_in === "number" && t.expires_in > 0 ? new Date(now + t.expires_in * 1000).toISOString() : null;
  db().prepare(`INSERT INTO provider_connections (user_id, provider, status, access_token_enc, refresh_token_enc, expires_at, scope, connected_at, last_error)
                VALUES (?,?, 'connected', ?,?,?,?,?, NULL)
                ON CONFLICT(user_id, provider) DO UPDATE SET status='connected', access_token_enc=excluded.access_token_enc,
                  refresh_token_enc=excluded.refresh_token_enc, expires_at=excluded.expires_at, scope=excluded.scope, last_error=NULL`)
    .run(uid, p.id, encryptSecret(t.access_token as string), refresh ? encryptSecret(refresh) : null, expires,
      typeof t.scope === "string" ? t.scope.slice(0, 200) : p.scopes.join(" "), new Date(now).toISOString());
}

/** Step 2: the callback. Validates state against THIS user and provider, then exchanges the code. */
export async function completeAuthorization(uid: UserId, p: OAuthProvider, state: unknown, code: unknown, f: typeof fetch = fetch, now = Date.now()) {
  if (typeof state !== "string" || typeof code !== "string" || !state || !code || state.length > 200 || code.length > 2000) {
    throw new IntegrationError("bad_callback", "The connection response was incomplete. Please try again.");
  }
  const h = sha256(state);
  const row = db().prepare("SELECT user_id, provider, verifier_enc, redirect_uri, expires_at FROM oauth_states WHERE state_hash = ?").get(h) as
    { user_id: number; provider: string; verifier_enc: string; redirect_uri: string; expires_at: string } | undefined;
  db().prepare("DELETE FROM oauth_states WHERE state_hash = ?").run(h); // single use, whatever happens next
  if (!row || row.user_id !== uid || row.provider !== p.id) throw new IntegrationError("bad_state", "This connection link isn't valid for your account. Please start again.", 403);
  if (Date.parse(row.expires_at) < now) throw new IntegrationError("expired_state", "The connection took too long. Please start again.");
  const form: Record<string, string> = { grant_type: "authorization_code", code, redirect_uri: row.redirect_uri };
  if (p.pkce) form.code_verifier = decryptSecret(row.verifier_enc);
  storeTokens(uid, p, await tokenRequest(p, form, f), null, now);
}

/** A valid access token, refreshed if it is about to expire. Never returned to the browser. */
export async function accessToken(uid: UserId, p: OAuthProvider, f: typeof fetch = fetch, now = Date.now(), force = false): Promise<string> {
  const c = db().prepare("SELECT status, access_token_enc, refresh_token_enc, expires_at FROM provider_connections WHERE user_id = ? AND provider = ?").get(uid, p.id) as
    { status: string; access_token_enc: string | null; refresh_token_enc: string | null; expires_at: string | null } | undefined;
  if (!c || !c.access_token_enc) throw new IntegrationError("not_connected", `${p.name} isn't connected.`, 404);
  const expiring = c.expires_at != null && Date.parse(c.expires_at) - REFRESH_SKEW_MS <= now;
  if (!force && !expiring) return decryptSecret(c.access_token_enc);
  if (!c.refresh_token_enc) { markStatus(uid, p, "reauth_required", "no_refresh_token"); throw new IntegrationError("reauth_required", `Please reconnect ${p.name}.`, 409); }
  const refresh = decryptSecret(c.refresh_token_enc);
  try {
    storeTokens(uid, p, await tokenRequest(p, { grant_type: "refresh_token", refresh_token: refresh }, f), refresh, now);
  } catch (e) {
    if (e instanceof ProviderHttpError && (e.status === 400 || e.status === 401)) { markStatus(uid, p, "reauth_required", "refresh_rejected"); throw new IntegrationError("reauth_required", `Please reconnect ${p.name}.`, 409); }
    throw e;
  }
  return accessToken(uid, p, f, now, false);
}

function markStatus(uid: UserId, p: OAuthProvider, status: string, code: string | null) {
  db().prepare("UPDATE provider_connections SET status = ?, last_error = ? WHERE user_id = ? AND provider = ?").run(status, code, uid, p.id);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Pull new records (paginated, retried, idempotent) and pass them through the normal validation + ingest. */
export async function syncProvider(uid: UserId, p: OAuthProvider, opts: { f?: typeof fetch; now?: number; days?: number; backoffMs?: number } = {}): Promise<IngestReport & { pages: number; providerRejected: number }> {
  const f = opts.f ?? fetch, now = opts.now ?? Date.now(), backoff = opts.backoffMs ?? 1000;
  const last = db().prepare("SELECT last_sync_at FROM provider_connections WHERE user_id = ? AND provider = ?").get(uid, p.id) as { last_sync_at: string | null } | undefined;
  if (!last) throw new IntegrationError("not_connected", `${p.name} isn't connected.`, 404);
  // Incremental: from 2 days before the last sync (late corrections), else the last N days.
  const since = new Date(last.last_sync_at ? Date.parse(last.last_sync_at) - 2 * 864e5 : now - (opts.days ?? 30) * 864e5);
  const until = new Date(now);
  const all: import("../signals/types").RawReading[] = [];
  let cursor: string | null = null, pages = 0, providerRejected = 0, refreshed = false;
  do {
    let attempt = 0;
    for (;;) {
      try {
        const page = await p.fetchPage({ accessToken: await accessToken(uid, p, f, now), since, until, cursor, fetch: f });
        all.push(...page.readings); providerRejected += page.rejected; cursor = page.nextCursor; pages++;
        break;
      } catch (e) {
        if (e instanceof ProviderHttpError && e.status === 401 && !refreshed) { refreshed = true; await accessToken(uid, p, f, now, true); continue; }
        if (e instanceof ProviderHttpError && e.status === 401) { markStatus(uid, p, "reauth_required", "unauthorized"); throw new IntegrationError("reauth_required", `Please reconnect ${p.name}.`, 409); }
        if (e instanceof ProviderHttpError && (e.status === 429 || e.status >= 500) && attempt < MAX_RETRIES) {
          attempt++;
          await sleep(Math.min(30_000, (e.retryAfterSec ?? 0) * 1000 || backoff * 2 ** (attempt - 1)));
          continue;
        }
        markStatus(uid, p, "error", e instanceof ProviderHttpError ? `http_${e.status}` : "sync_failed");
        throw e instanceof IntegrationError ? e : new IntegrationError("sync_failed", `Couldn't sync ${p.name} right now. Try again later.`, 502);
      }
    }
  } while (cursor && pages < MAX_PAGES);
  const report = ingest(uid, p.id, all, now);
  db().prepare("UPDATE provider_connections SET last_sync_at = ?, status = 'connected', last_error = NULL WHERE user_id = ? AND provider = ?").run(new Date(now).toISOString(), uid, p.id);
  return { ...report, pages, providerRejected };
}

/** Disconnect: revoke at the provider (best effort), delete tokens; optionally delete imported data. */
export async function disconnect(uid: UserId, p: OAuthProvider, opts: { deleteData?: boolean; f?: typeof fetch } = {}) {
  const c = db().prepare("SELECT access_token_enc, refresh_token_enc FROM provider_connections WHERE user_id = ? AND provider = ?").get(uid, p.id) as
    { access_token_enc: string | null; refresh_token_enc: string | null } | undefined;
  let revoked = false;
  if (c && p.revokeUrl && tokenKey()) {
    const token = c.refresh_token_enc ? decryptSecret(c.refresh_token_enc) : c.access_token_enc ? decryptSecret(c.access_token_enc) : null;
    if (token) {
      try {
        const res = await (opts.f ?? fetch)(p.revokeUrl, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token, client_id: process.env[p.clientIdEnv] ?? "", client_secret: process.env[p.clientSecretEnv] ?? "" }) });
        revoked = res.ok;
      } catch { revoked = false; }
    }
  }
  db().transaction(() => {
    db().prepare("DELETE FROM provider_connections WHERE user_id = ? AND provider = ?").run(uid, p.id);
    db().prepare("DELETE FROM oauth_states WHERE user_id = ? AND provider = ?").run(uid, p.id);
    if (opts.deleteData) {
      db().prepare("DELETE FROM signal_readings WHERE user_id = ? AND provider = ?").run(uid, p.id);
      db().prepare("DELETE FROM signal_connections WHERE user_id = ? AND provider = ?").run(uid, p.id);
    }
  })();
  return { revoked };
}

/** Revoke every provider connection for a user (before account deletion). */
export async function disconnectAll(uid: UserId, f: typeof fetch = fetch) {
  const rows = db().prepare("SELECT provider FROM provider_connections WHERE user_id = ?").all(uid) as { provider: string }[];
  for (const r of rows) if (OAUTH_PROVIDERS[r.provider]) await disconnect(uid, OAUTH_PROVIDERS[r.provider], { f }).catch(() => {});
}

/** Safe status for the UI: never tokens. */
export function connectionInfo(uid: UserId) {
  return (db().prepare("SELECT provider, status, scope, connected_at, last_sync_at, last_error FROM provider_connections WHERE user_id = ?").all(uid) as
    { provider: string; status: string; scope: string | null; connected_at: string; last_sync_at: string | null; last_error: string | null }[]);
}
