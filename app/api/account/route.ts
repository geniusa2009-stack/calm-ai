import { deleteAccount } from "@/lib/auth";
import { clearedCookie, json, route } from "@/lib/http";

export const GET = route((_req, { user }) => ({ email: user.email, demo: user.isDemo, createdAt: user.createdAt }));

/** Permanently delete the account and every row it owns. Requires the password (re-authentication). */
export const DELETE = route(async (req, { user }) => {
  const b = await req.json().catch(() => ({}));
  await deleteAccount(user.id, b.password);
  return json({ ok: true }, { headers: { "set-cookie": clearedCookie() } });
});
