import type { Day } from "./days";
import { addDays, daysBetween, localDate } from "./days";
import { FALLBACK_TZ } from "../time";
import type { SupportSession } from "../types";
import { strainSeries } from "./pulse";
import { mean, median, round } from "./stats";
import { prettyTag } from "./context";

export interface Episode {
  start: string;
  end: string | null; // null = ongoing
  peak: number;
  days: number; // time from start until back within usual
  supportUsed: number;
  recoveryTags: string[];
  /** Longest stretch without a check-in inside the episode, in days. */
  maxGap: number;
  /** True when gaps make the duration unreliable; excluded from "typical". */
  uncertain: boolean;
}

export interface RecoveryProfile {
  episodes: Episode[];
  typicalDays: number | null;
  trend: "faster" | "slower" | "stable" | null;
  helpers: string[]; // tags common in the days of recovery
  text: string;
}

const START = 1.2, END = 0.5, SEVERE = 2.2;
/** An episode with a hole longer than this can't be timed honestly. */
export const MAX_GAP_DAYS = 3;

export function recoveryProfile(days: Day[], sessions: SupportSession[], tz: string = FALLBACK_TZ): RecoveryProfile {
  const series = strainSeries(days).filter((s) => s.stage !== "learning");
  const episodes: Episode[] = [];
  let cur: { start: string; peak: number } | null = null;

  // An episode needs two consecutive check-ins above START (or one severe day);
  // a single rough day is ordinary variation, not a "harder stretch".
  for (let i = 0; i < series.length; i++) {
    const s = series[i];
    const next = series[i + 1];
    if (!cur) {
      if (s.strain >= SEVERE || (s.strain >= START && next && next.strain >= START)) cur = { start: s.date, peak: s.strain };
    } else {
      cur.peak = Math.max(cur.peak, s.strain);
      if (s.strain < END) {
        episodes.push(finish(cur, s.date));
        cur = null;
      }
    }
  }
  if (cur) episodes.push(finish(cur, null));

  function finish(c: { start: string; peak: number }, end: string | null): Episode {
    const until = end ?? series.at(-1)!.date;
    // Sessions are dated in the zone they happened in (local calendar date), like check-ins.
    const used = sessions.filter((x) => { const d = localDate(x.ts, x.tz ?? tz); return d >= c.start && d <= until; }).length;
    // tags seen in the 3 days leading into the return to baseline
    const tagDays = end ? days.filter((d) => { const a = daysBetween(d.date, end); return a >= 0 && a <= 2; }) : [];
    const inside = series.filter((x) => x.date >= c.start && x.date <= until).map((x) => x.date);
    let maxGap = 0;
    for (let i = 1; i < inside.length; i++) maxGap = Math.max(maxGap, daysBetween(inside[i - 1], inside[i]) - 1);
    return {
      start: c.start, end, peak: round(c.peak, 2), days: daysBetween(c.start, until),
      supportUsed: used, recoveryTags: [...new Set(tagDays.flatMap((d) => d.tags))],
      maxGap, uncertain: maxGap > MAX_GAP_DAYS,
    };
  }

  const done = episodes.filter((e) => e.end && !e.uncertain);
  const typicalDays = done.length ? median(done.map((e) => e.days)) : null;
  let trend: RecoveryProfile["trend"] = null;
  if (done.length >= 3) {
    const half = Math.floor(done.length / 2);
    const early = mean(done.slice(0, half).map((e) => e.days)), late = mean(done.slice(-half).map((e) => e.days));
    trend = late < early - 0.75 ? "faster" : late > early + 0.75 ? "slower" : "stable";
  }
  const tagFreq = new Map<string, number>();
  done.forEach((e) => e.recoveryTags.forEach((t) => tagFreq.set(t, (tagFreq.get(t) ?? 0) + 1)));
  // A helper must show up in most recoveries AND be clearly more common then than on an average day.
  const base = (t: string) => days.filter((d) => d.tags.includes(t)).length / Math.max(days.length, 1);
  const recDays = done.reduce((a, e) => a + (e.recoveryTags.length ? 3 : 0), 0) || 1;
  const helpers = [...tagFreq.entries()]
    .filter(([t, n]) => n >= Math.max(2, done.length / 2) && n / recDays >= 1.5 * base(t))
    .map(([t]) => t)
    .filter((t) => !["deadline", "exam", "conflict", "poor-sleep", "late-screens", "travel", "sick"].includes(t));

  const ongoing = episodes.find((e) => !e.end);
  let text: string;
  const gappy = episodes.filter((e) => e.uncertain).length;
  if (!episodes.length) text = days.length < 14 ? "Recovery patterns appear once Calm has seen a harder stretch and how you come back from it." : "No sustained strain episodes so far — your harder days have resolved quickly.";
  else if (ongoing) text = `${ongoing.days === 0 ? "A harder stretch started today." : `You're ${ongoing.days + 1} days into a harder stretch.`}${typicalDays != null ? ` Previously you've come back in about ${round(typicalDays, 0)} days.` : ""}`;
  else if (typicalDays == null) text = "Calm has seen harder stretches, but gaps in check-ins mean it can't yet say how long recovery usually takes.";
  else text = `After harder stretches you typically return to your usual in about ${round(typicalDays, 0)} day${typicalDays === 1 ? "" : "s"}.`;
  if (helpers.length) text += ` Recoveries often included: ${helpers.map(prettyTag).join(", ")}.`;
  if (trend === "faster") text += " You're bouncing back faster than earlier on.";
  if (gappy) text += ` (${gappy} stretch${gappy > 1 ? "es" : ""} had gaps in check-ins, so ${gappy > 1 ? "they aren't" : "it isn't"} counted.)`;

  return { episodes, typicalDays, trend, helpers, text };
}

export { addDays };
