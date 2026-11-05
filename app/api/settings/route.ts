import { saveSettings } from "@/lib/db";
import { handle, int, oneOf, str } from "@/lib/validate";
import type { Mode, Settings } from "@/lib/types";
import { REGIONS } from "@/lib/safety";

export const POST = handle(async (req) => {
  const b = await req.json();
  const p: Partial<Settings> = {};
  if (b.mode !== undefined) p.mode = oneOf(b.mode, "mode", ["everyday", "study", "work", "activity", "recovery"] as Mode[]);
  if (b.displayName !== undefined) p.displayName = str(b.displayName, "displayName", 40, true) ?? "";
  if (b.region !== undefined) p.region = oneOf(b.region, "region", REGIONS.map((r) => r[0]));
  if (b.quietStart !== undefined) p.quietStart = int(b.quietStart, "quietStart", 0, 23)!;
  if (b.quietEnd !== undefined) p.quietEnd = int(b.quietEnd, "quietEnd", 0, 23)!;
  for (const k of ["onboarded", "nudgesEnabled", "companionEnabled", "companionUsesContext"] as const) {
    if (typeof b[k] === "boolean") p[k] = b[k];
  }
  saveSettings(p);
});
