import { destroySession } from "@/lib/auth";
import { clearedCookie, json, route } from "@/lib/http";

export const POST = route({ public: true }, (_req, { token }) => {
  destroySession(token);
  return json({ ok: true }, { headers: { "set-cookie": clearedCookie() } });
});
