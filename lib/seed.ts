import { addCheckIn, addMemory, addSession, addCircle, saveSettings, wipeUserData, type UserId } from "./db";
import type { Mode, ToolId } from "./types";
import { addDays, localDate, resolveTimeZone, weekdayOf, zonedTimeToUtc } from "./time";

/** Small deterministic PRNG so demo data is the same every time. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const clampInt = (x: number, lo = 1, hi = 10) => Math.max(lo, Math.min(hi, Math.round(x)));

/**
 * Six weeks of believable, clearly-labelled demo data with real structure the
 * engine can discover: sleep → next-day stress, deadlines raise stress,
 * exercise helps, late screens cut sleep, one strain episode with a recovery,
 * and a gentle slide over the last few days for the radar to notice.
 */
export function seedDemo(uid: UserId, mode: Mode = "work", days = 42, timezone = "UTC") {
  const tz = resolveTimeZone(timezone);
  wipeUserData(uid); // only ever called for a demo account (enforced by callers)
  const r = rng(7);
  const now = new Date();
  const today = localDate(now, tz);
  let prevSleep = 7.2;
  let prevLateScreens = false;

  for (let i = days - 1; i >= 0; i--) {
    // Local wall-clock time on that local day, in the account's zone.
    const day = addDays(today, -i);
    let date = zonedTimeToUtc(day, 9 + Math.floor(r() * 10), Math.floor(r() * 60), tz);
    if (date > now) date = new Date(now.getTime() - 60e3); // today's entry can't be in the future
    if (i > 0 && r() < 0.08) continue; // occasional missed day
    const dow = weekdayOf(day);
    const tags: string[] = [];
    const episode = i <= 30 && i >= 24; // a harder stretch ~4 weeks ago
    const slide = i <= 4; // gentle recent drift

    if ((dow >= 1 && dow <= 4 && r() < 0.3) || (episode && r() < 0.75)) tags.push("deadline");
    if (r() < (episode ? 0.15 : 0.4)) tags.push("exercise");
    if (r() < (slide ? 0.7 : 0.28)) tags.push("late-screens");
    if (r() < 0.3) tags.push("caffeine");
    if (dow === 0 || dow === 6 ? r() < 0.5 : r() < 0.15) tags.push("time-outside");
    if (r() < 0.2) tags.push("social");
    if (episode && r() < 0.3) tags.push("conflict");

    // sleep the night before; late screens the previous day cut it
    let sleep = 7.3 + (r() - 0.5) * 1.2 - (prevSleep < 6.5 ? -0.2 : 0);
    if (episode) sleep -= 1.0;
    if (slide) sleep -= 0.35 * (5 - i);
    if (prevLateScreens) sleep -= 0.7; // last night's screens cut last night's sleep
    sleep = Math.max(4, Math.min(9.5, Math.round(sleep * 4) / 4));

    let stress = 4 + (r() - 0.5) * 1.8 + (7 - sleep) * 0.8;
    if (tags.includes("deadline")) stress += 2.0;
    if (tags.includes("conflict")) stress += 1.2;
    if (tags.includes("exercise")) stress -= 0.9;
    if (tags.includes("time-outside")) stress -= 0.6;
    if (dow === 1) stress += 0.8;
    if (slide) stress += 0.35 * (5 - i);
    if (episode) stress += 1.2;

    let mood = 6.6 + (r() - 0.5) * 1.6 - (stress - 4) * 0.45 + (tags.includes("social") ? 0.8 : 0);
    let energy = 6.3 + (r() - 0.5) * 1.6 + (sleep - 7) * 0.7 + (tags.includes("exercise") ? 0.5 : 0) - (episode ? 0.8 : 0);
    if (slide) { mood -= 0.15 * (5 - i); energy -= 0.25 * (5 - i); }
    const focus = clampInt(6 + (sleep - 7) * 0.6 - (stress - 5) * 0.35 + (r() - 0.5) * 1.5);
    const quality = clampInt(3 + (sleep - 7) * 0.9 + (r() - 0.5), 1, 5);

    addCheckIn(uid, {
      ts: date.toISOString(), mood: clampInt(mood), energy: clampInt(energy), stress: clampInt(stress), focus,
      sleepHours: sleep, sleepQuality: quality, tags, mode, tz,
      note: i === 27 ? "Three deadlines landed at once. Barely slept." : i === 22 ? "Took the afternoon off and went for a long walk. Felt human again." : null,
    }, "demo");
    prevSleep = sleep;
    prevLateScreens = tags.includes("late-screens");

    // support sessions on harder days, with realistic per-tool effectiveness
    if (stress >= 5.5 && r() < 0.85) {
      const options: [ToolId, number][] = [["breath-sigh", 2.2], ["grounding", 1.4], ["micro-reset", 0.8], ["breath-box", 1.6], ["soundscape", 1.2]];
      const [tool, eff] = options[Math.floor(r() * options.length)];
      const pre = clampInt(stress + r());
      const post = clampInt(pre - eff + (r() - 0.5) * 1.5);
      addSession(uid, { ts: new Date(Math.min(now.getTime(), date.getTime() + 3600e3)).toISOString(), tz, tool, preStress: pre, postStress: post,
        helpful: pre - post >= 2 ? 1 : pre - post <= 0 ? -1 : 0, durationSec: 60 + Math.floor(r() * 300), note: null });
    }
  }

  const at = (daysAgo: number) => new Date(now.getTime() - daysAgo * 864e5).toISOString();
  addMemory(uid, "trigger", "Several deadlines landing in the same week is what really gets me.", "user", at(27));
  addMemory(uid, "helped", "A long walk outside, phone in pocket, reset the whole day.", "user", at(22));
  addMemory(uid, "win", "Said no to an extra project and didn't feel guilty.", "user", at(15));
  addMemory(uid, "note", "Mondays feel heavier when I don't plan the week on Sunday.", "user", at(9));
  addCircle(uid, { name: "Sam", relation: "Close friend", contact: null, note: "Good for a walk and a vent" });
  addCircle(uid, { name: "Mum", relation: "Family", contact: null, note: null });
  saveSettings(uid, { onboarded: true, mode, displayName: "", timezone: tz });
}
