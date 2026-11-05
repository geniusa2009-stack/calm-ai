import type { Day } from "./days";
import { addDays } from "./days";
import { linreg, mean, pearson, round, sd } from "./stats";

export type EffectMetric = "stress" | "mood" | "energy" | "sleepHours";
export interface ContextEffect {
  key: string;
  tag: string;
  metric: EffectMetric;
  lag: 0 | 1; // 0 = same day, 1 = next day
  diff: number; // tagged minus untagged, in raw units
  d: number; // standardized effect size
  nTagged: number;
  confidence: "low" | "medium" | "high";
  text: string;
}

export interface SleepLink { metric: "stress" | "mood" | "energy"; perHour: number; r: number; n: number; text: string }
export interface WeekdayPattern { weekday: string; diff: number; n: number; text: string }

const METRIC_WORD: Record<EffectMetric, string> = { stress: "stress", mood: "mood", energy: "energy", sleepHours: "sleep" };
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const prettyTag = (t: string) => t.replace(/-/g, " ");

/** Welch t-statistic: how distinguishable the tagged days are from the rest, given noise and sample size. */
function welchT(a: number[], b: number[]) {
  const va = (sd(a) || 0) ** 2, vb = (sd(b) || 0) ** 2;
  const se = Math.sqrt(va / a.length + vb / b.length) || 1;
  return (mean(a) - mean(b)) / se;
}

function confidenceFor(t: number, n: number): ContextEffect["confidence"] {
  const at = Math.abs(t);
  return at >= 3.5 && n >= 6 ? "high" : at >= 2.5 && n >= 4 ? "medium" : "low";
}

/** How each context tag relates to your metrics on the same day and the day after. */
export function tagEffects(days: Day[]): ContextEffect[] {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const tagCounts = new Map<string, number>();
  days.forEach((d) => d.tags.forEach((t) => tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1)));

  const effects: ContextEffect[] = [];
  for (const [tag, count] of tagCounts) {
    if (count < 3) continue;
    for (const lag of [0, 1] as const) {
      for (const metric of ["stress", "mood", "energy", "sleepHours"] as EffectMetric[]) {
        if (lag === 0 && metric === "sleepHours") continue; // today's sleep happened before today's tags
        const tagged: number[] = [], untagged: number[] = [];
        for (const d of days) {
          const target = lag === 0 ? d : byDate.get(addDays(d.date, 1));
          const v = target?.[metric] as number | null | undefined;
          if (v == null) continue;
          (d.tags.includes(tag) ? tagged : untagged).push(v);
        }
        if (tagged.length < 3 || untagged.length < 3) continue;
        const diff = mean(tagged) - mean(untagged);
        const pooled = Math.sqrt(((sd(tagged) || 0) ** 2 + (sd(untagged) || 0) ** 2) / 2) || 1;
        const d = diff / Math.max(pooled, metric === "sleepHours" ? 0.4 : 0.8);
        const t = welchT(tagged, untagged);
        // Next-day effects are more easily confounded, so they need stronger evidence.
        if (Math.abs(d) < 0.45 || Math.abs(t) < (lag === 0 ? 2 : 2.6)) continue;
        const word = METRIC_WORD[metric];
        const unit = metric === "sleepHours" ? "h" : "";
        const when = lag === 0 ? `On days with “${prettyTag(tag)}”` : `The day after “${prettyTag(tag)}”`;
        const dirWord = metric === "sleepHours" ? (diff > 0 ? "longer" : "shorter") : diff > 0 ? "higher" : "lower";
        effects.push({
          key: `ctx:${tag}:${metric}:${lag}`, tag, metric, lag, diff: round(diff, 2), d: round(d, 2),
          nTagged: tagged.length, confidence: confidenceFor(t, tagged.length),
          text: `${when}, your ${word} tends to be ${round(Math.abs(diff))}${unit} ${dirWord} (${tagged.length} times).`,
        });
      }
    }
  }
  // Keep the strongest effect per tag+metric (same-day vs next-day duplicates)
  const best = new Map<string, ContextEffect>();
  for (const e of effects) {
    const k = `${e.tag}:${e.metric}`;
    if (!best.has(k) || Math.abs(best.get(k)!.d) < Math.abs(e.d)) best.set(k, e);
  }
  const rank = { high: 2, medium: 1, low: 0 };
  return [...best.values()].sort((a, b) => rank[b.confidence] - rank[a.confidence] || Math.abs(b.d) - Math.abs(a.d));
}

/** Relationship between last night's sleep and today's state. */
export function sleepLinks(days: Day[]): SleepLink[] {
  const rows = days.filter((d) => d.sleepHours != null);
  if (rows.length < 8) return [];
  const xs = rows.map((d) => d.sleepHours!);
  const out: SleepLink[] = [];
  for (const metric of ["stress", "mood", "energy"] as const) {
    const ys = rows.map((d) => d[metric]);
    const r = pearson(xs, ys);
    if (!Number.isFinite(r) || Math.abs(r) < 0.25) continue;
    const { b } = linreg(xs, ys);
    const dir = b > 0 ? "higher" : "lower";
    out.push({
      metric, perHour: round(b, 2), r: round(r, 2), n: rows.length,
      text: `For you, each extra hour of sleep the night before goes with about ${round(Math.abs(b))} ${dir} ${metric} that day.`,
    });
  }
  return out;
}

export function weekdayPatterns(days: Day[]): WeekdayPattern[] {
  if (days.length < 21) return [];
  const overall = mean(days.map((d) => d.stress));
  const out: WeekdayPattern[] = [];
  for (let w = 0; w < 7; w++) {
    const xs = days.filter((d) => new Date(d.date + "T12:00:00").getDay() === w).map((d) => d.stress);
    if (xs.length < 3) continue;
    const diff = mean(xs) - overall;
    if (Math.abs(diff) >= 0.8) {
      out.push({ weekday: WEEKDAYS[w], diff: round(diff), n: xs.length,
        text: `${WEEKDAYS[w]}s tend to run ${round(Math.abs(diff))} ${diff > 0 ? "higher" : "lower"} in stress than your other days.` });
    }
  }
  return out.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
}
