import { clearCompanion, getSettings } from "@/lib/db";
import { companionReply } from "@/lib/companion";
import { handle, str, BadRequest } from "@/lib/validate";

export const dynamic = "force-dynamic";

export const POST = handle(async (req) => {
  if (!getSettings().companionEnabled) throw new BadRequest("The companion is turned off in Settings.");
  const b = await req.json();
  return await companionReply(str(b.text, "text", 4000)!);
});
export const DELETE = handle(() => { clearCompanion(); });
