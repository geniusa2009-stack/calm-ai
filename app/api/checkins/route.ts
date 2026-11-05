import { addCheckIn, deleteCheckIn, getSettings, listCheckIns, addMemory } from "@/lib/db";
import { groupByDay } from "@/lib/engine/days";
import { computePulse } from "@/lib/engine/pulse";
import { crisisResources, detectCrisis } from "@/lib/safety";
import { handle, int, num, str, BadRequest } from "@/lib/validate";

export const dynamic = "force-dynamic";

export const POST = handle(async (req) => {
  const b = await req.json();
  const settings = getSettings();
  const tags = Array.isArray(b.tags) ? b.tags.filter((t: unknown) => typeof t === "string").slice(0, 12) : [];
  const note = str(b.note, "note", 2000, true);
  const before = computePulse(groupByDay(listCheckIns()));
  const checkin = addCheckIn({
    mood: int(b.mood, "mood", 1, 10)!, energy: int(b.energy, "energy", 1, 10)!, stress: int(b.stress, "stress", 1, 10)!,
    focus: int(b.focus, "focus", 1, 10, true), sleepHours: num(b.sleepHours, "sleepHours", 0, 16, true),
    sleepQuality: int(b.sleepQuality, "sleepQuality", 1, 5, true), tags, note, mode: settings.mode,
  });
  if (b.remember && note) addMemory("note", note);
  const after = computePulse(groupByDay(listCheckIns()));
  const crisis = detectCrisis(note);
  return { checkin, before: { state: before.state, score: before.score }, pulse: after, crisis, resources: crisis ? crisisResources(settings.region) : undefined };
});

export const DELETE = handle(async (req) => {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id)) throw new BadRequest("id required");
  deleteCheckIn(id);
});
