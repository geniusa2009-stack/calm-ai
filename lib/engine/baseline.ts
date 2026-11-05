import type { Day } from "./days";
import { daysBetween } from "./days";
import { median, robustSpread } from "./stats";

export type BMetric = "stress" | "mood" | "energy" | "sleepHours" | "focus";
export const BMETRICS: BMetric[] = ["stress", "mood", "energy", "sleepHours", "focus"];

/** Adverse direction: +1 means "higher is worse". */
export const ADVERSE: Record<BMetric, 1 | -1> = { stress: 1, mood: -1, energy: -1, sleepHours: -1, focus: -1 };

/**
 * Population priors. These only matter in the first days; personal data
 * takes over via shrinkage whose prior weight itself fades to zero by day 21,
 * so an established baseline is entirely the person's own.
 */
const PRIOR: Record<BMetric, { center: number; spread: number; floor: number }> = {
  stress: { center: 4.5, spread: 1.8, floor: 0.8 },
  mood: { center: 6, spread: 1.6, floor: 0.8 },
  energy: { center: 6, spread: 1.6, floor: 0.8 },
  sleepHours: { center: 7, spread: 1, floor: 0.4 },
  focus: { center: 6, spread: 1.6, floor: 0.8 },
};
const PRIOR_WEIGHT = 3;
const personalWeight = (n: number) => (n === 0 ? 0 : n / (n + PRIOR_WEIGHT * Math.max(0, 1 - n / 21)));

export interface MetricBaseline { center: number; spread: number; n: number; personalWeight: number }
export type Baseline = Record<BMetric, MetricBaseline> & { days: number; stage: Stage };
export type Stage = "learning" | "forming" | "established";

export function stageFor(nDays: number): Stage {
  return nDays < 5 ? "learning" : nDays < 14 ? "forming" : "established";
}

const val = (d: Day, m: BMetric) => d[m] as number | null;

/**
 * Baseline as of `asOf`: personal "usual", learned from a trailing window that
 * excludes the most recent days so that a current shift doesn't absorb itself.
 */
export function computeBaseline(days: Day[], asOf: string, opts: { window?: number; exclude?: number } = {}): Baseline {
  const window = opts.window ?? 35;
  const exclude = opts.exclude ?? 3;
  let pool = days.filter((d) => {
    const age = daysBetween(d.date, asOf);
    return age >= exclude && age < window + exclude;
  });
  // Early on there isn't enough history to exclude recent days — use what exists before asOf.
  if (pool.length < 7) pool = days.filter((d) => daysBetween(d.date, asOf) >= 1 && daysBetween(d.date, asOf) < window + exclude);
  if (pool.length < 3) pool = days.filter((d) => daysBetween(d.date, asOf) >= 0);

  const out = {} as Record<BMetric, MetricBaseline>;
  for (const m of BMETRICS) {
    const xs = pool.map((d) => val(d, m)).filter((x): x is number => x != null);
    const p = PRIOR[m];
    const w = personalWeight(xs.length);
    const center = xs.length ? w * median(xs) + (1 - w) * p.center : p.center;
    const spread = xs.length >= 2 ? w * robustSpread(xs, p.floor) + (1 - w) * p.spread : p.spread;
    out[m] = { center, spread, n: xs.length, personalWeight: w };
  }
  const total = days.filter((d) => daysBetween(d.date, asOf) >= 0).length;
  return { ...out, days: total, stage: stageFor(total) };
}

/** Signed deviation where positive = worse than your usual, in units of your usual spread. */
export function adverseZ(b: Baseline, m: BMetric, value: number | null) {
  if (value == null) return null;
  return (ADVERSE[m] * (value - b[m].center)) / b[m].spread;
}
