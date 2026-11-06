import { createSession, destroySession, login } from "@/lib/auth";
import { clientKey, json, route, sessionCookie } from "@/lib/http";
import { getSettings, saveSettings } from "@/lib/db";
import { canonicalTimeZone } from "@/lib/time";

export const POST = route({ public: true }, async (req, { token }) => {
  const b = await req.json();
  const user = await login(b.email, b.password, clientKey(req));
  destroySession(token); // never reuse a pre-login session (fixation)
  // Fill in a missing zone from the browser; an existing choice is never overwritten here.
  const detected = canonicalTimeZone(b.timezone);
  if (detected && !getSettings(user.id).timezone) saveSettings(user.id, { timezone: detected });
  const s = createSession(user.id);
  return json({ ok: true }, { headers: { "set-cookie": sessionCookie(s.token, s.expires) } });
});
