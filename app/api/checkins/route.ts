import { addCheckIn, deleteCheckIn, getSettings, listCheckIns, addMemory } from "@/lib/db";
import { groupByDay } from "@/lib/engine/days";
import { computePulse } from "@/lib/engine/pulse";
import { crisisResources, detectCrisis } from "@/lib/safety";
import { route } from "@/lib/http";
import { resolveTimeZone } from "@/lib/time";
import { int, num, str, BadRequest } from "@/lib/validate";

export const dynamic = "force-dynamic";

export const POST = route(async (req, { user }) => {
  const b = await req.json();
  const settings = getSettings(user.id);
  const tz = resolveTimeZone(settings.timezone);
  const tags = Array.isArray(b.tags) ? b.tags.filter((t: unknown) => typeof t === "string").slice(0, 12) : [];
  const note = str(b.note, "note", 2000, true);
  const before = computePulse(groupByDay(listCheckIns(user.id), tz), new Date(), tz);
  const checkin = addCheckIn(user.id, {
    mood: int(b.mood, "mood", 1, 10)!, energy: int(b.energy, "energy", 1, 10)!, stress: int(b.stress, "stress", 1, 10)!,
    focus: int(b.focus, "focus", 1, 10, true), sleepHours: num(b.sleepHours, "sleepHours", 0, 16, true),
    sleepQuality: int(b.sleepQuality, "sleepQuality", 1, 5, true), tags, note, mode: settings.mode,
    tz, // the zone this check-in belongs to, kept even if the person travels later
  }, user.isDemo ? "demo" : "manual");
  if (b.remember && note) addMemory(user.id, "note", note);
  const after = computePulse(groupByDay(listCheckIns(user.id), tz), new Date(), tz);
  const crisis = detectCrisis(note);
  return { checkin, before: { state: before.state, score: before.score }, pulse: after, crisis, resources: crisis ? crisisResources(settings.region) : undefined };
});

export const DELETE = route(async (req, { user }) => {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id)) throw new BadRequest("id required");
  if (!deleteCheckIn(user.id, id)) throw new BadRequest("Not found");
});
