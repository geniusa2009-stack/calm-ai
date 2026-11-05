import { createSession, register } from "@/lib/auth";
import { clientKey, json, route, sessionCookie } from "@/lib/http";

export const POST = route({ public: true }, async (req) => {
  const b = await req.json();
  const user = await register(b.email, b.password, clientKey(req));
  const s = createSession(user.id);
  return json({ ok: true }, { headers: { "set-cookie": sessionCookie(s.token, s.expires) } });
});
