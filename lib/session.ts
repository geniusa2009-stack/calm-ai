import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, userForToken, type User } from "./auth";

/** For server components: the signed-in user, or null. */
export async function currentUser(): Promise<User | null> {
  const jar = await cookies();
  return userForToken(jar.get(SESSION_COOKIE)?.value);
}

/** For protected pages: the signed-in user, or a redirect to /login. */
export async function requireUser(): Promise<User> {
  const u = await currentUser();
  if (!u) redirect("/login");
  return u;
}
