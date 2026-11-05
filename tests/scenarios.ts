/**
 * Reproducible synthetic scenarios for auditing the engine.
 * Everything is driven by a seeded PRNG, so results are identical on every run.
 * These are behavioural fixtures, NOT clinical data.
 */
import type { Day } from "../lib/engine/days";
import { addDays, localDate } from "../lib/engine/days";

export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal via Box–Muller. */
export function gauss(r: () => number) {
  const u = Math.max(r(), 1e-12), v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const clampScale = (x: number) => Math.min(10, Math.max(1, Math.round(x)));
const clampSleep = (x: number) => Math.min(12, Math.max(3, Math.round(x * 4) / 4));

export interface ScenarioOpts {
  days?: number;
  seed?: number;
  noise?: number; // SD of day-to-day noise on 1–10 scales
  /** shift applied to stress (positive = worse) as a function of day index */
  stressShift?: (i: number, n: number) => number;
  moodShift?: (i: number, n: number) => number;
  energyShift?: (i: number, n: number) => number;
  sleepShift?: (i: number, n: number) => number;
  missingRate?: number; // probability a day has no check-in
  sleepMissingRate?: number;
  tags?: (i: number, r: () => number) => string[];
}

/** Generate `days` of check-in days ending at `end` (default today). */
export function scenario(o: ScenarioOpts = {}, end = localDate(new Date())): Day[] {
  const n = o.days ?? 60;
  const r = rng(o.seed ?? 1);
  const noise = o.noise ?? 1;
  const out: Day[] = [];
  for (let i = 0; i < n; i++) {
    // draw all randoms every day so the stream is stable regardless of options
    const g = [gauss(r), gauss(r), gauss(r), gauss(r), gauss(r)];
    const miss = r(), sleepMiss = r();
    const tags = o.tags ? o.tags(i, r) : [];
    if (miss < (o.missingRate ?? 0) && i !== n - 1) continue;
    out.push({
      date: addDays(end, i - (n - 1)),
      stress: clampScale(4.5 + noise * g[0] + (o.stressShift?.(i, n) ?? 0)),
      mood: clampScale(6.5 + noise * g[1] - (o.moodShift?.(i, n) ?? 0)),
      energy: clampScale(6 + noise * g[2] - (o.energyShift?.(i, n) ?? 0)),
      focus: clampScale(6 + noise * g[3]),
      sleepHours: sleepMiss < (o.sleepMissingRate ?? 0) ? null : clampSleep(7.2 + 0.6 * noise * g[4] - (o.sleepShift?.(i, n) ?? 0)),
      sleepQuality: 3,
      tags,
      notes: [],
      count: 1,
    });
  }
  return out;
}

/** Evaluate `fn` as if it were each day from `start` onward (no peeking at later data). */
export function rolling<T>(days: Day[], start: number, fn: (visible: Day[], now: Date) => T): { date: string; value: T }[] {
  const res: { date: string; value: T }[] = [];
  for (let k = start; k < days.length; k++) {
    const visible = days.slice(0, k + 1);
    const now = new Date(days[k].date + "T20:00:00");
    res.push({ date: days[k].date, value: fn(visible, now) });
  }
  return res;
}
