import { createDemoUser, createSession, destroySession } from "@/lib/auth";
import { seedDemo } from "@/lib/seed";
import { json, route, sessionCookie } from "@/lib/http";
import { oneOf } from "@/lib/validate";
import type { Mode } from "@/lib/types";

/** Start a separate, throwaway demo account (expires in 24h). Never touches a real account. */
export const POST = route({ public: true }, async (req, { token }) => {
  const b = await req.json().catch(() => ({}));
  const mode = b.mode ? oneOf(b.mode, "mode", ["everyday", "study", "work", "activity", "recovery"] as Mode[]) : "work";
  destroySession(token);
  const user = createDemoUser();
  seedDemo(user.id, mode);
  const s = createSession(user.id, true);
  return json({ ok: true }, { headers: { "set-cookie": sessionCookie(s.token, s.expires) } });
});
