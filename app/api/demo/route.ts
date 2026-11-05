import { seedDemo } from "@/lib/seed";
import { handle, oneOf } from "@/lib/validate";
import type { Mode } from "@/lib/types";
export const POST = handle(async (req) => {
  const b = await req.json().catch(() => ({}));
  seedDemo(b.mode ? oneOf(b.mode, "mode", ["everyday", "study", "work", "activity", "recovery"] as Mode[]) : "work");
});
