import { clearCompanion, getSettings } from "@/lib/db";
import { companionReply } from "@/lib/companion";
import { route } from "@/lib/http";
import { str, BadRequest } from "@/lib/validate";

export const dynamic = "force-dynamic";

export const POST = route(async (req, { user }) => {
  if (!getSettings(user.id).companionEnabled) throw new BadRequest("The companion is turned off in Settings.");
  const b = await req.json();
  return await companionReply(user.id, str(b.text, "text", 4000)!);
});
export const DELETE = route((_req, { user }) => { clearCompanion(user.id); });
