import type { Day } from "./days";
import { addDays, daysBetween, localDate, weekdayOf } from "./days";
import { formatDay } from "../time";
import type { SupportSession } from "../types";
import { computeBaseline } from "./baseline";
import { tagEffects, sleepLinks, weekdayPatterns, prettyTag, confidenceFromQ } from "./context";
import { recoveryProfile } from "./recovery";
import { toolEfficacy, toolById } from "./support";
import { mean, round } from "./stats";

export interface Insight {
  key: string;
  kind: "week" | "context" | "sleep" | "recovery" | "support" | "rhythm";
  title: string;
  body: string;
  confidence: "low" | "medium" | "high";
}

/** ISO-ish week id (YYYY-Www) so 'hide' on the weekly summary only lasts that week. */
export function weekKey(date: string) {
  // ISO week of a local calendar date (Thursday rule), computed on the date alone.
  const thursday = addDays(date, 3 - ((weekdayOf(date) + 6) % 7));
  const jan1 = thursday.slice(0, 4) + "-01-01";
  return `${thursday.slice(0, 4)}-W${String(Math.floor(daysBetween(jan1, thursday) / 7) + 1).padStart(2, "0")}`;
}

/** Weekly insights. User feedback (+1 fits / -1 doesn't fit) re-ranks or hides cards. */
export function weeklyInsights(days: Day[], sessions: SupportSession[], feedback: Record<string, number>, now = new Date(), tz?: string): Insight[] {
  const asOf = localDate(now, tz);
  const out: Insight[] = [];
  const thisWeek = days.filter((d) => { const a = daysBetween(d.date, asOf); return a >= 0 && a < 7; });
  const lastWeek = days.filter((d) => { const a = daysBetween(d.date, asOf); return a >= 7 && a < 14; });
  const b = computeBaseline(days, asOf, { exclude: 7 });

  if (thisWeek.length >= 3) {
    const s = mean(thisWeek.map((d) => d.stress)), m = mean(thisWeek.map((d) => d.mood));
    const best = [...thisWeek].sort((x, y) => (y.mood - y.stress) - (x.mood - x.stress))[0];
    const hard = [...thisWeek].sort((x, y) => (x.mood - x.stress) - (y.mood - y.stress))[0];
    const vs = lastWeek.length >= 3 ? mean(lastWeek.map((d) => d.stress)) : null;
    const delta = vs != null ? s - vs : s - b.stress.center;
    const comp = vs != null ? "last week" : "your usual";
    const dayName = (d: string) => formatDay(d, { weekday: "long" });
    out.push({
      key: `week:${weekKey(asOf)}`, kind: "week", confidence: thisWeek.length >= 5 ? "high" : "medium",
      title: Math.abs(delta) < 0.5 ? "A fairly typical week" : delta > 0 ? "A heavier week than " + comp : "A lighter week than " + comp,
      body: `Stress averaged ${round(s)} (${delta >= 0 ? "+" : ""}${round(delta)} vs ${comp}), mood ${round(m)}. ` +
        (best.date !== hard.date ? `${dayName(best.date)} was your best day; ${dayName(hard.date)} the hardest.` : ""),
    });
  }

  const effects = tagEffects(days).filter((e) => e.confidence !== "low").slice(0, 3);
  for (const e of effects) {
    out.push({ key: e.key, kind: "context", confidence: e.confidence, title: `“${prettyTag(e.tag)}” and your ${e.metric === "sleepHours" ? "sleep" : e.metric}`, body: e.text });
  }

  const sl = sleepLinks(days)[0];
  if (sl) out.push({ key: `sleep:${sl.metric}`, kind: "sleep", confidence: confidenceFromQ(sl.q, sl.n) ?? "low", title: "Sleep matters for you", body: sl.text });

  const wk = weekdayPatterns(days)[0];
  if (wk) out.push({ key: `rhythm:${wk.weekday}`, kind: "rhythm", confidence: confidenceFromQ(wk.q, wk.n) ?? "low", title: `Your ${wk.weekday}s`, body: wk.text });

  const rec = recoveryProfile(days, sessions, tz);
  const reliable = rec.episodes.filter((e) => e.end && !e.uncertain).length;
  if (rec.episodes.length) out.push({ key: "recovery:profile", kind: "recovery", confidence: reliable >= 3 ? "medium" : "low", title: "How you recover", body: rec.text });

  const eff = Object.values(toolEfficacy(sessions)).filter((e) => e.sessions >= 2 && e.avgDrop != null).sort((a, c) => c.score - a.score)[0];
  if (eff && eff.avgDrop! > 0.5) {
    out.push({ key: `support:${eff.tool}`, kind: "support", confidence: eff.sessions >= 4 ? "high" : "medium",
      title: `${toolById(eff.tool)!.name} works for you`,
      body: `Across ${eff.sessions} sessions it brought your stress down by about ${eff.avgDrop} points. Calm will suggest it first when things get tense.` });
  }

  return out
    .filter((i) => (feedback[i.key] ?? 0) >= 0)
    .sort((a, c) => (feedback[c.key] ?? 0) - (feedback[a.key] ?? 0))
    .slice(0, 6);
}
