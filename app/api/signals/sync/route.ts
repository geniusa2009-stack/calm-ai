import { syncProvider } from "@/lib/signals/sync";
import { route } from "@/lib/http";
import { str } from "@/lib/validate";

export const POST = route(async (req, { user }) => {
  const b = await req.json();
  return { report: await syncProvider(user, str(b.provider, "provider", 40)!) };
});
