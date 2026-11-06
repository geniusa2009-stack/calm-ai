import { createSession, register } from "@/lib/auth";
import { clientKey, json, readCookie, route, sessionCookie } from "@/lib/http";
import { saveSettings } from "@/lib/db";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import { canonicalTimeZone } from "@/lib/time";

export const POST = route({ public: true }, async (req) => {
  const b = await req.json();
  const user = await register(b.email, b.password, clientKey(req));
  // A new account starts with whatever theme this device was already using.
  const theme = parseTheme(readCookie(req, THEME_COOKIE));
  if (theme !== "system") saveSettings(user.id, { theme });
  // The browser's detected zone becomes the account's zone at sign-up (it can be changed in Settings).
  const timezone = canonicalTimeZone(b.timezone);
  if (timezone) saveSettings(user.id, { timezone });
  const s = createSession(user.id);
  return json({ ok: true }, { headers: { "set-cookie": sessionCookie(s.token, s.expires) } });
});
