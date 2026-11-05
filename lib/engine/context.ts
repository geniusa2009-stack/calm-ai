import type { Day } from "./days";
import { addDays } from "./days";
import { bhAdjust, linreg, mean, pearson, pearsonP, round, sd, welch } from "./stats";

/**
 * Context intelligence: which tags, sleep amounts and weekdays go with
 * changes in how this person feels.
 *
 * Statistical approach (deliberately simple and explainable):
 * - Each candidate is a Welch t-test (tagged vs untagged days), with a
 *   proper t-distribution p-value using Welch–Satterthwaite df, so small
 *   samples are penalised correctly.
 * - Every candidate tested in one call is corrected together with
 *   Benjamini–Hochberg (false discovery rate), because a person with 8 tags
 *   generates ~50 tests and some would pass by chance.
 * - An effect-size floor stops tiny-but-"significant" differences.
 *
 * Known limits: days are not independent (bad weeks cluster), tags co-occur
 * (confounding), and these are associations, never causes.
 */

export type EffectMetric = "stress" | "mood" | "energy" | "sleepHours";
export type Confidence = "low" | "medium" | "high";
export interface ContextEffect {
  key: string;
  tag: string;
  metric: EffectMetric;
  lag: 0 | 1; // 0 = same day, 1 = next day
  diff: number; // tagged minus untagged, in raw units
  d: number; // standardized effect size
  nTagged: number;
  p: number;
  q: number; // BH-adjusted
  confidence: Confidence;
  text: string;
}

export interface SleepLink { metric: "stress" | "mood" | "energy"; perHour: number; r: number; n: number; q: number; text: string }
export interface WeekdayPattern { weekday: string; diff: number; n: number; q: number; text: string }

const METRIC_WORD: Record<EffectMetric, string> = { stress: "stress", mood: "mood", energy: "energy", sleepHours: "sleep" };
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** FDR thresholds for the labels the UI shows. */
export const Q_HIGH = 0.01, Q_MEDIUM = 0.05, Q_SHOW = 0.1;
export const MIN_TAG_DAYS = 3;

export const prettyTag = (t: string) => t.replace(/-/g, " ");

export function confidenceFromQ(q: number, n: number): Confidence | null {
  if (q < Q_HIGH && n >= 6) return "high";
  if (q < Q_MEDIUM && n >= 4) return "medium";
  if (q < Q_SHOW) return "low";
  return null;
}

/** How each context tag relates to your metrics on the same day and the day after. */
export function tagEffects(days: Day[]): ContextEffect[] {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const tagCounts = new Map<string, number>();
  days.forEach((d) => d.tags.forEach((t) => tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1)));

  type Cand = Omit<ContextEffect, "q" | "confidence">;
  const cands: Cand[] = [];
  for (const [tag, count] of tagCounts) {
    if (count < MIN_TAG_DAYS) continue;
    for (const lag of [0, 1] as const) {
      for (const metric of ["stress", "mood", "energy", "sleepHours"] as EffectMetric[]) {
        if (lag === 0 && metric === "sleepHours") continue; // today's sleep happened before today's tags
        const tagged: number[] = [], untagged: number[] = [];
        for (const d of days) {
          const target = lag === 0 ? d : byDate.get(addDays(d.date, 1)); // missing next day => skipped, not guessed
          const v = target?.[metric] as number | null | undefined;
          if (v == null) continue;
          (d.tags.includes(tag) ? tagged : untagged).push(v);
        }
        if (tagged.length < MIN_TAG_DAYS || untagged.length < MIN_TAG_DAYS) continue;
        const diff = mean(tagged) - mean(untagged);
        const pooled = Math.sqrt(((sd(tagged) || 0) ** 2 + (sd(untagged) || 0) ** 2) / 2);
        const d = diff / Math.max(pooled, metric === "sleepHours" ? 0.4 : 0.8);
        const { p } = welch(tagged, untagged);
        const word = METRIC_WORD[metric];
        const unit = metric === "sleepHours" ? "h" : "";
        const when = lag === 0 ? `On days with “${prettyTag(tag)}”` : `The day after “${prettyTag(tag)}”`;
        const dirWord = metric === "sleepHours" ? (diff > 0 ? "longer" : "shorter") : diff > 0 ? "higher" : "lower";
        cands.push({
          key: `ctx:${tag}:${metric}:${lag}`, tag, metric, lag, diff: round(diff, 2), d: round(d, 2), nTagged: tagged.length, p,
          text: `${when}, your ${word} tends to be ${round(Math.abs(diff))}${unit} ${dirWord} (${tagged.length} times).`,
        });
      }
    }
  }

  // Correct across *all* tests run, including ones we won't show.
  const qs = bhAdjust(cands.map((c) => c.p));
  const kept: ContextEffect[] = [];
  cands.forEach((c, i) => {
    if (Math.abs(c.d) < 0.45) return;
    const confidence = confidenceFromQ(qs[i], c.nTagged);
    if (confidence) kept.push({ ...c, q: qs[i], confidence });
  });

  // Keep the strongest effect per tag+metric (same-day vs next-day duplicates)
  const best = new Map<string, ContextEffect>();
  for (const e of kept) {
    const k = `${e.tag}:${e.metric}`;
    if (!best.has(k) || best.get(k)!.q > e.q) best.set(k, e);
  }
  const rank = { high: 2, medium: 1, low: 0 };
  return [...best.values()].sort((a, b) => rank[b.confidence] - rank[a.confidence] || Math.abs(b.d) - Math.abs(a.d));
}

/** Relationship between last night's sleep and today's state. */
export function sleepLinks(days: Day[]): SleepLink[] {
  const rows = days.filter((d) => d.sleepHours != null);
  if (rows.length < 10) return [];
  const xs = rows.map((d) => d.sleepHours!);
  const metrics = ["stress", "mood", "energy"] as const;
  const stats = metrics.map((metric) => {
    const ys = rows.map((d) => d[metric]);
    const r = pearson(xs, ys);
    return { metric, ys, r, p: pearsonP(r, rows.length) };
  });
  const qs = bhAdjust(stats.map((s) => s.p));
  const out: SleepLink[] = [];
  stats.forEach((s, i) => {
    if (!Number.isFinite(s.r) || Math.abs(s.r) < 0.25 || qs[i] >= Q_MEDIUM) return;
    const { b } = linreg(xs, s.ys);
    out.push({
      metric: s.metric, perHour: round(b, 2), r: round(s.r, 2), n: rows.length, q: qs[i],
      text: `For you, each extra hour of sleep the night before goes with about ${round(Math.abs(b))} ${b > 0 ? "higher" : "lower"} ${s.metric} that day.`,
    });
  });
  return out.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
}

export function weekdayPatterns(days: Day[]): WeekdayPattern[] {
  if (days.length < 21) return [];
  const dow = (d: Day) => new Date(d.date + "T12:00:00").getDay();
  const cands: { w: number; diff: number; n: number; p: number }[] = [];
  for (let w = 0; w < 7; w++) {
    const xs = days.filter((d) => dow(d) === w).map((d) => d.stress);
    const rest = days.filter((d) => dow(d) !== w).map((d) => d.stress);
    if (xs.length < 3) continue;
    cands.push({ w, diff: mean(xs) - mean(rest), n: xs.length, p: welch(xs, rest).p });
  }
  const qs = bhAdjust(cands.map((c) => c.p));
  return cands
    .map((c, i) => ({ ...c, q: qs[i] }))
    .filter((c) => Math.abs(c.diff) >= 0.8 && c.q < Q_MEDIUM)
    .map((c) => ({
      weekday: WEEKDAYS[c.w], diff: round(c.diff), n: c.n, q: c.q,
      text: `${WEEKDAYS[c.w]}s tend to run ${round(Math.abs(c.diff))} ${c.diff > 0 ? "higher" : "lower"} in stress than your other days.`,
    }))
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
}
