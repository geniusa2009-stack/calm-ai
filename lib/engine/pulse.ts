import type { Day } from "./days";
import { addDays, daysBetween, localDate } from "./days";
import { ADVERSE, adverseZ, BMETRICS, computeBaseline, type BMetric, type Baseline, type Stage } from "./baseline";
import { clamp, ewma, round } from "./stats";

export const STRAIN_WEIGHTS: Record<BMetric, number> = { stress: 0.35, mood: 0.25, energy: 0.2, sleepHours: 0.15, focus: 0.05 };

export type PulseState = "learning" | "no-recent" | "bright" | "steady" | "stretched" | "strained" | "running-low" | "recovering";

export const STATE_COPY: Record<PulseState, { label: string; blurb: string }> = {
  learning: { label: "Getting to know you", blurb: "A few more check-ins and Calm will know what your usual looks like." },
  "no-recent": { label: "Not enough recent data", blurb: "No check-ins in the last few days, so Calm won't guess how you're doing. A quick one brings your pulse up to date." },
  bright: { label: "Brighter than usual", blurb: "You're doing better than your own typical — worth noticing what's helping." },
  steady: { label: "Steady", blurb: "You're within your usual range." },
  stretched: { label: "Stretched", blurb: "You're running a bit outside your usual. Nothing alarming — a small reset may help." },
  strained: { label: "Strained", blurb: "This is clearly harder than your usual. Let's make some room." },
  "running-low": { label: "Running low", blurb: "Your energy is below your usual even though stress isn't spiking — rest may matter more than effort." },
  recovering: { label: "Recovering", blurb: "You're coming back from a harder stretch. Keep doing what's working." },
};

export interface Driver { metric: BMetric; value: number; usual: number; z: number; text: string }

export interface Pulse {
  state: PulseState;
  label: string;
  blurb: string;
  score: number; // 0-100; 60 marks "your usual"
  strain: number; // weighted adverse deviation (0 = usual)
  confidence: number; // 0-1
  confidenceText: string;
  stage: Stage;
  drivers: Driver[];
  lastCheckIn: string | null;
  baseline: Baseline;
}

const NAMES: Record<BMetric, string> = { stress: "Stress", mood: "Mood", energy: "Energy", sleepHours: "Sleep", focus: "Focus" };
const fmt = (m: BMetric, v: number) => (m === "sleepHours" ? `${round(v, 1)}h` : `${round(v, 1)}`);

/** Recent value per metric: EWMA over the last few days, weighting today most. */
function recentValues(days: Day[], asOf: string) {
  const recent = days.filter((d) => { const a = daysBetween(d.date, asOf); return a >= 0 && a < 4; });
  const out = {} as Record<BMetric, number | null>;
  for (const m of BMETRICS) {
    const xs = recent.map((d) => d[m] as number | null).filter((x): x is number => x != null);
    out[m] = xs.length ? ewma(xs, 0.55) : null;
  }
  return { values: out, n: recent.length };
}

export function strainFor(b: Baseline, values: Record<BMetric, number | null>) {
  let s = 0, w = 0;
  const zs = {} as Record<BMetric, number | null>;
  for (const m of BMETRICS) {
    const z = adverseZ(b, m, values[m]);
    zs[m] = z;
    if (z == null) continue;
    // cap each contribution so one extreme number can't dominate
    s += STRAIN_WEIGHTS[m] * clamp(z, -2.5, 3.5);
    w += STRAIN_WEIGHTS[m];
  }
  return { strain: w ? s / w : 0, zs };
}

/** Daily strain series using a rolling, look-back-only baseline (no future leakage). */
export function strainSeries(days: Day[]) {
  return [...days].sort((a, b) => (a.date < b.date ? -1 : 1)).map((d) => {
    const b = computeBaseline(days, d.date);
    const vals = Object.fromEntries(BMETRICS.map((m) => [m, d[m]])) as Record<BMetric, number | null>;
    return { date: d.date, strain: strainFor(b, vals).strain, stage: b.stage };
  });
}

export function computePulse(allDays: Day[], now = new Date()): Pulse {
  const asOf = localDate(now);
  // Ignore anything dated after "now" (clock skew, delayed or out-of-order imports).
  const days = allDays.filter((d) => d.date <= asOf);
  const baseline = computeBaseline(days, asOf);
  const { values, n } = recentValues(days, asOf);
  const last = days.at(-1) ?? null;

  if (!last || n === 0) {
    const state: PulseState = days.length >= 5 ? "no-recent" : "learning";
    const s = STATE_COPY[state];
    return {
      state, label: s.label, blurb: s.blurb,
      score: 60, strain: 0, confidence: 0, confidenceText: last ? `Last check-in ${daysBetween(last.date, asOf)} days ago` : "No data yet",
      stage: baseline.stage, drivers: [], lastCheckIn: last?.date ?? null, baseline,
    };
  }

  const { strain, zs } = strainFor(baseline, values);

  const drivers: Driver[] = BMETRICS
    .filter((m) => zs[m] != null && Math.abs(zs[m]!) >= 0.7)
    .sort((a, b) => Math.abs(zs[b]!) * STRAIN_WEIGHTS[b] - Math.abs(zs[a]!) * STRAIN_WEIGHTS[a])
    .slice(0, 3)
    .map((m) => {
      const v = values[m]!, u = baseline[m].center, z = zs[m]!;
      const dir = ADVERSE[m] * (v - u) > 0 ? (m === "stress" ? "higher" : "lower") : m === "stress" ? "lower" : "higher";
      return { metric: m, value: v, usual: u, z, text: `${NAMES[m]} ${fmt(m, v)} — ${dir} than your usual ${fmt(m, u)}` };
    });

  // Recovering: strain recently peaked and is now clearly coming down
  const series = strainSeries(days.filter((d) => daysBetween(d.date, asOf) < 10));
  const recentPeak = Math.max(...series.filter((s) => { const a = daysBetween(s.date, asOf); return a >= 1 && a <= 7; }).map((s) => s.strain), -Infinity);

  let state: PulseState;
  if (baseline.stage === "learning") state = "learning";
  else if (strain >= 1.5) state = "strained";
  else if (recentPeak >= 1.2 && recentPeak - strain >= 0.7 && strain < 1.0) state = "recovering";
  else if ((zs.energy ?? 0) >= 1.2 && (zs.stress ?? 0) < 0.8 && strain < 1.5) state = "running-low";
  else if (strain >= 0.75) state = "stretched";
  else if (strain <= -0.6) state = "bright";
  else state = "steady";

  // Confidence is a heuristic, not a probability. It multiplies:
  //  - personal: how much of the baseline is the person's own data (0 → 1 by ~day 21)
  //  - freshness: how recent the latest check-in is
  //  - coverage: how much of the strain weighting is backed by actual metrics, and
  //    whether the recent window has more than a single day in it
  const personal = baseline.stress.personalWeight;
  const staleness = daysBetween(last.date, asOf);
  const freshness = staleness <= 0 ? 1 : staleness === 1 ? 0.8 : staleness === 2 ? 0.6 : 0.4;
  const weightPresent = BMETRICS.reduce((a, m) => a + (values[m] != null ? STRAIN_WEIGHTS[m] : 0), 0);
  const coverage = (0.6 + 0.4 * weightPresent) * (n >= 2 ? 1 : 0.85);
  const confidence = round(clamp(personal * freshness * coverage, 0, 1), 2);
  const confidenceText =
    baseline.stage === "learning" ? `Early read — based on ${baseline.days} day${baseline.days === 1 ? "" : "s"}`
    : staleness >= 2 ? `Last check-in ${staleness} days ago`
    : confidence >= 0.7 ? `Solid read — ${baseline.days} days of your history`
    : weightPresent < 0.75 ? "Partial read — some measures missing recently"
    : `Forming — ${baseline.days} days so far`;

  const copy = STATE_COPY[state];
  return {
    state, label: copy.label, blurb: copy.blurb,
    score: Math.round(clamp(60 - 14 * strain, 0, 100)),
    strain: round(strain, 2), confidence, confidenceText, stage: baseline.stage, drivers,
    lastCheckIn: last.date, baseline,
  };
}

export { addDays };
