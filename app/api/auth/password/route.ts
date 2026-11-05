import { changePassword } from "@/lib/auth";
import { route } from "@/lib/http";

export const POST = route(async (req, { user, token }) => {
  const b = await req.json();
  await changePassword(user.id, b.current, b.next, token);
});
