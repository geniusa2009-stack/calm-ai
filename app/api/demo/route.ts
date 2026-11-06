import { seedDemo } from "@/lib/seed";
import { route } from "@/lib/http";
import { getSettings } from "@/lib/db";
import { oneOf, BadRequest } from "@/lib/validate";
import type { Mode } from "@/lib/types";

/** Reload demo data. Only demo accounts may do this — demo data never enters a real account. */
export const POST = route(async (req, { user }) => {
  if (!user.isDemo) throw new BadRequest("Demo data can only be loaded into a demo account. Use “Try the demo” from the sign-in page.");
  const b = await req.json().catch(() => ({}));
  seedDemo(user.id, b.mode ? oneOf(b.mode, "mode", ["everyday", "study", "work", "activity", "recovery"] as Mode[]) : "work", 42, getSettings(user.id).timezone || "UTC");
});
