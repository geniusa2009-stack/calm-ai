import { addMemory, addSession } from "@/lib/db";
import { toolById, TOOLS } from "@/lib/engine/support";
import { route } from "@/lib/http";
import { int, oneOf, str } from "@/lib/validate";
import type { ToolId } from "@/lib/types";

export const POST = route(async (req, { user }) => {
  const b = await req.json();
  const tool = oneOf(b.tool, "tool", TOOLS.map((t) => t.id) as ToolId[]);
  const helpful = b.helpful === 1 || b.helpful === -1 || b.helpful === 0 ? b.helpful : null;
  const s = addSession(user.id, {
    tool, preStress: int(b.preStress, "preStress", 1, 10)!, postStress: int(b.postStress, "postStress", 1, 10, true),
    helpful, durationSec: int(b.durationSec ?? 0, "durationSec", 0, 7200)!, note: str(b.note, "note", 1000, true),
  });
  // Remember clear wins automatically, so Personal Memory reflects what actually helps.
  if (s.postStress != null && s.preStress - s.postStress >= 3 && helpful === 1) {
    addMemory(user.id, "helped", `${toolById(tool)!.name} took stress from ${s.preStress} to ${s.postStress}.`, "system");
  }
  return { session: s };
});
