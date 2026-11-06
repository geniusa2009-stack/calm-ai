import { saveSettings } from "@/lib/db";
import { route } from "@/lib/http";
import { int, oneOf, str } from "@/lib/validate";
import { THEMES, type DeviceSetup, type Mode, type Settings } from "@/lib/types";
import { REGIONS } from "@/lib/safety";
import { canonicalTimeZone } from "@/lib/time";
import { BadRequest } from "@/lib/validate";

export const POST = route(async (req, { user }) => {
  const b = await req.json();
  const p: Partial<Settings> = {};
  if (b.mode !== undefined) p.mode = oneOf(b.mode, "mode", ["everyday", "study", "work", "activity", "recovery"] as Mode[]);
  if (b.displayName !== undefined) p.displayName = str(b.displayName, "displayName", 40, true) ?? "";
  if (b.region !== undefined) p.region = oneOf(b.region, "region", REGIONS.map((r) => r[0]));
  if (b.quietStart !== undefined) p.quietStart = int(b.quietStart, "quietStart", 0, 23)!;
  if (b.quietEnd !== undefined) p.quietEnd = int(b.quietEnd, "quietEnd", 0, 23)!;
  if (b.deviceSetup !== undefined) p.deviceSetup = oneOf(b.deviceSetup, "deviceSetup", ["pending", "in-progress", "done", "skipped"] as DeviceSetup[]);
  if (b.timezone !== undefined) {
    const tz = canonicalTimeZone(b.timezone);
    if (!tz) throw new BadRequest("timezone must be an IANA zone such as Africa/Cairo");
    p.timezone = tz;
  }
  if (b.theme !== undefined) p.theme = oneOf(b.theme, "theme", THEMES);
  if (b.deviceStep !== undefined) p.deviceStep = int(b.deviceStep, "deviceStep", 0, 20)!;
  for (const k of ["onboarded", "nudgesEnabled", "companionEnabled", "companionUsesContext", "notifyEnabled", "wakeLockEnabled", "hapticsEnabled"] as const) {
    if (typeof b[k] === "boolean") p[k] = b[k];
  }
  saveSettings(user.id, p);
});
