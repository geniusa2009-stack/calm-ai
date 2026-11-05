import { createSession, destroySession, login } from "@/lib/auth";
import { clientKey, json, route, sessionCookie } from "@/lib/http";

export const POST = route({ public: true }, async (req, { token }) => {
  const b = await req.json();
  const user = await login(b.email, b.password, clientKey(req));
  destroySession(token); // never reuse a pre-login session (fixation)
  const s = createSession(user.id);
  return json({ ok: true }, { headers: { "set-cookie": sessionCookie(s.token, s.expires) } });
});
