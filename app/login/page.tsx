import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { LoginForm } from "./LoginForm";
import { cookies } from "next/headers";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  if (await currentUser()) redirect("/");
  const { mode } = await searchParams;
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return <LoginForm initialMode={mode === "register" ? "register" : "login"} theme={theme} />;
}
