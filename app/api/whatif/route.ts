import { getSettings, listCheckIns, listSessions } from "@/lib/db";
import { resolveTimeZone } from "@/lib/time";
import { groupByDay } from "@/lib/engine/days";
import { whatIf } from "@/lib/engine/whatif";
import { route } from "@/lib/http";
import { num } from "@/lib/validate";

export const dynamic = "force-dynamic";
const tagList = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 8) : []);

export const POST = route(async (req, { user }) => {
  const b = await req.json();
  const tz = resolveTimeZone(getSettings(user.id).timezone);
  return whatIf(groupByDay(listCheckIns(user.id), tz), listSessions(user.id), {
    sleepDelta: num(b.sleepDelta ?? 0, "sleepDelta", -3, 3)!, reduceTags: tagList(b.reduceTags), addTags: tagList(b.addTags), dailySupport: !!b.dailySupport,
  }, new Date(), tz);
});
