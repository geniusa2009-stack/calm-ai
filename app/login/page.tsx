import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  if (await currentUser()) redirect("/");
  const { mode } = await searchParams;
  return <LoginForm initialMode={mode === "register" ? "register" : "login"} />;
}
