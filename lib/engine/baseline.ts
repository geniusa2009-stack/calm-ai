import type { Day } from "./days";
import { daysBetween } from "./days";
import { median, robustSpread } from "./stats";

export type BMetric = "stress" | "mood" | "energy" | "sleepHours" | "focus";
export const BMETRICS: BMetric[] = ["stress", "mood", "energy", "sleepHours", "focus"];

export const ADVERSE: Record<BMetric, 1 | -1> = { stress: 1, mood: -1, energy: -1, sleepHours: -1, focus: -1 };

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

export function computeBaseline(days: Day[], asOf: string, opts: { window?: number; exclude?: number } = {}): Baseline {
  const window = opts.window ?? 35;
  const exclude = opts.exclude ?? 3;
  let pool = days.filter((d) => {
    const age = daysBetween(d.date, asOf);
    return age >= exclude && age < window + exclude;
  });
  if (pool.length < 7) {
    const prior = days.filter((d) => { const age = daysBetween(d.date, asOf); return age >= 1 && age < window + exclude; });
    if (prior.length > pool.length) pool = prior;
  }

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

export function adverseZ(b: Baseline, m: BMetric, value: number | null) {
  if (value == null) return null;
  return (ADVERSE[m] * (value - b[m].center)) / b[m].spread;
}
