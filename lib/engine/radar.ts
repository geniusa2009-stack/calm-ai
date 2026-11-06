import type { Day } from "./days";
import { daysBetween, localDate } from "./days";
import { adverseZ, computeBaseline } from "./baseline";
import { mean, median, robustSpread, round, sd, slope, welch } from "./stats";
import { strainSeries } from "./pulse";

export type Severity = "positive" | "gentle" | "notice" | "act";

export interface Signal {
  id: string;
  severity: Severity;
  title: string;
  detail: string; // what we see, in plain words
  why: string; // why it might matter
  suggestion: string;
  evidence: string[];
}

/**
 * Early Shift Radar: looks for slow, multi-day changes relative to the
 * person's own baseline — the kind that are easy to miss day-to-day.
 * Deliberately conservative: it needs agreement across several days.
 */
export function scanRadar(allDays: Day[], now = new Date(), sensitivity = 1, tz?: string): { signals: Signal[]; ready: boolean; note?: string } {
  const asOf = localDate(now, tz);
  const days = allDays.filter((d) => d.date <= asOf); // ignore future-dated / out-of-order data
  const b = computeBaseline(days, asOf);
  if (b.days < 7) return { signals: [], ready: false, note: `Radar starts watching after 7 days of check-ins (${b.days} so far).` };

  const within = (n: number) => days.filter((d) => { const a = daysBetween(d.date, asOf); return a >= 0 && a < n; });
  const last5 = within(5), last7 = within(7);
  const signals: Signal[] = [];
  const k = sensitivity; // >1 = more sensitive (lower thresholds)

  // 1. Sustained stress elevation
  // Needs both persistence (3+ elevated days) and magnitude (average clearly above usual);
  // persistence alone fires ~3% of days on pure noise.
  const zStress = last5.map((d) => adverseZ(b, "stress", d.stress) ?? 0);
  const elevated = last5.filter((_, i) => zStress[i] >= 1 / k);
  if (last5.length >= 3 && elevated.length >= 3 && mean(zStress) >= 0.9 / k) {
    signals.push({
      id: "sustained-stress",
      severity: elevated.length >= 4 ? "act" : "notice",
      title: "Stress has stayed above your usual",
      detail: `${elevated.length} of your last ${last5.length} check-ins had stress above your usual range (usual ≈ ${round(b.stress.center)}).`,
      why: "One hard day is normal. Several in a row is usually where load starts to build up.",
      suggestion: "Plan one deliberate recovery block today — even 10 minutes — rather than waiting for the weekend.",
      evidence: elevated.map((d) => `${d.date}: stress ${round(d.stress)}`),
    });
  }

  // 2. Sleep slide
  const sleep7 = last7.map((d) => d.sleepHours).filter((x): x is number => x != null);
  if (sleep7.length >= 5) {
    // Slope is expressed in the person's own spread so naturally variable sleepers aren't flagged more.
    const sl = slope(sleep7) / b.sleepHours.spread;
    const recent = mean(sleep7.slice(-3));
    const shortNights = sleep7.slice(-5).filter((x) => x < b.sleepHours.center - 0.5 * b.sleepHours.spread).length;
    if (sl <= -0.15 / k && recent < b.sleepHours.center - 0.75 * b.sleepHours.spread && shortNights >= 3) {
      signals.push({
        id: "sleep-slide",
        severity: recent < b.sleepHours.center - 1.5 * b.sleepHours.spread ? "notice" : "gentle",
        title: "Sleep is gradually slipping",
        detail: `Your sleep has drifted down over the past week — recently ~${round(recent)}h vs your usual ${round(b.sleepHours.center)}h.`,
        why: "For many people, sleep moves first and mood or stress follow a few days later.",
        suggestion: "Try protecting tonight's wind-down: a fixed screens-off time 30 minutes earlier.",
        evidence: last7.filter((d) => d.sleepHours != null).map((d) => `${d.date}: ${d.sleepHours}h`),
      });
    }
  }

  // 3. Energy falling while stress rises ("scissors")
  const last6 = within(6);
  if (last6.length >= 5) {
    const sS = slope(last6.map((d) => d.stress));
    const sE = slope(last6.map((d) => d.energy));
    // Trends in spread units, AND both already outside usual — trends alone are mostly noise.
    const last3 = last6.slice(-3);
    const zS = mean(last3.map((d) => adverseZ(b, "stress", d.stress) ?? 0));
    const zE = mean(last3.map((d) => adverseZ(b, "energy", d.energy) ?? 0));
    if (sS / b.stress.spread >= 0.2 / k && -sE / b.energy.spread >= 0.2 / k && zS >= 0.6 / k && zE >= 0.6 / k) {
      signals.push({
        id: "scissors",
        severity: "notice",
        title: "Energy is dropping while stress climbs",
        detail: `Over the last ${last6.length} days stress has risen ~${round(sS * last6.length)} points and energy fallen ~${round(-sE * last6.length)}.`,
        why: "When these two move apart together it often signals running on reserves.",
        suggestion: "Consider trimming one commitment this week and adding one thing that refuels you.",
        evidence: last6.map((d) => `${d.date}: stress ${round(d.stress)}, energy ${round(d.energy)}`),
      });
    }
  }

  // 4. Mood volatility
  const moods = last7.map((d) => d.mood);
  if (moods.length >= 5) {
    const ratio = sd(moods) / b.mood.spread;
    if (ratio >= 1.7 / Math.sqrt(k)) {
      signals.push({
        id: "volatility",
        severity: "gentle",
        title: "Your mood has been swinging more than usual",
        detail: `Day-to-day mood changes this week are about ${round(ratio)}× your typical variation.`,
        why: "Bigger swings can reflect irregular sleep, schedule changes, or things being unsettled.",
        suggestion: "Notice whether the lower days share something — sleep, a place, a person, a task.",
        evidence: last7.map((d) => `${d.date}: mood ${round(d.mood)}`),
      });
    }
  }

  // 5. Gentle mood slide without any single bad day
  if (last5.length >= 4) {
    const m = mean(last5.map((d) => d.mood));
    const worst = Math.min(...last5.map((d) => d.mood));
    if (m < b.mood.center - 0.8 * b.mood.spread / k && worst > b.mood.center - 2.5 * b.mood.spread && !signals.some((s) => s.id === "volatility")) {
      signals.push({
        id: "mood-slide",
        severity: "gentle",
        title: "Mood is quietly a little lower",
        detail: `No single day stands out, but your mood has averaged ${round(m)} vs your usual ${round(b.mood.center)}.`,
        why: "Slow slides are the easiest to miss — which is why it's worth naming.",
        suggestion: "Something small and enjoyable, scheduled on purpose, often helps more than expected.",
        evidence: last5.map((d) => `${d.date}: mood ${round(d.mood)}`),
      });
    }
  }

  // 6. Long-horizon drift. The short baseline (35 days) slowly absorbs a gradual
  // change, so a slow decline can become the "new usual". Compare the last two
  // weeks against an older anchor window to catch that.
  for (const m of ["stress", "mood", "energy"] as const) {
    const recentVals = days.filter((d) => daysBetween(d.date, asOf) < 14).map((d) => d[m]);
    const anchorVals = days.filter((d) => { const a = daysBetween(d.date, asOf); return a >= 42 && a < 120; }).map((d) => d[m]);
    if (recentVals.length < 8 || anchorVals.length < 14) continue;
    const spread = robustSpread(anchorVals, 0.8);
    const shift = (m === "stress" ? 1 : -1) * (median(recentVals) - median(anchorVals)); // positive = worse
    const { p } = welch(recentVals, anchorVals);
    if (shift >= 0.9 * spread / k && p < 0.01) {
      const word = m === "stress" ? "risen" : "fallen";
      signals.push({
        id: `long-drift-${m}`,
        severity: "notice",
        title: `Your usual ${m} has been slowly shifting`,
        detail: `Over the past couple of months your typical ${m} has ${word} from about ${round(median(anchorVals))} to ${round(median(recentVals))}.`,
        why: "Slow changes don't feel like changes day to day — and Calm's own sense of “usual” adapts too, which is why this check looks further back.",
        suggestion: "Think back to when things felt more like the earlier level. What was different then?",
        evidence: [`Earlier (6–17 weeks ago): median ${round(median(anchorVals))} over ${anchorVals.length} days`, `Last 2 weeks: median ${round(median(recentVals))} over ${recentVals.length} days`],
      });
      break; // one drift message is enough
    }
  }

  // 7. Positive signals
  const series = strainSeries(days.filter((d) => daysBetween(d.date, asOf) < 14));
  const recentS = series.filter((s) => daysBetween(s.date, asOf) < 3);
  const priorPeak = Math.max(...series.filter((s) => { const a = daysBetween(s.date, asOf); return a >= 3 && a < 12; }).map((s) => s.strain), -Infinity);
  if (recentS.length >= 2 && priorPeak >= 1.2 && mean(recentS.map((s) => s.strain)) < 0.4) {
    signals.push({
      id: "recovered",
      severity: "positive",
      title: "You've bounced back",
      detail: "After a harder stretch last week, your last few days are back within your usual range.",
      why: "Noticing what helped you recover makes it easier to use again next time.",
      suggestion: "Add a note to your memory about what helped — your future self will thank you.",
      evidence: recentS.map((s) => `${s.date}: strain ${round(s.strain, 2)}`),
    });
  } else if (recentS.length >= 3 && recentS.every((s) => s.strain <= -0.5)) {
    signals.push({
      id: "bright-streak",
      severity: "positive",
      title: "A good stretch",
      detail: "Three days in a row better than your usual.",
      why: "Good stretches have causes too.",
      suggestion: "What's been different? Capture it while it's fresh.",
      evidence: recentS.map((s) => `${s.date}: strain ${round(s.strain, 2)}`),
    });
  }

  // 8. Check-in gap (data quality, framed softly)
  const lastDay = days.at(-1);
  if (lastDay) {
    const gap = daysBetween(lastDay.date, asOf);
    if (gap >= 3) {
      signals.push({
        id: "gap",
        severity: "gentle",
        title: "It's been a few days",
        detail: `Your last check-in was ${gap} days ago, so the radar is working from older information.`,
        why: "Gaps sometimes happen exactly when things get busy or hard.",
        suggestion: "A 20-second check-in is enough — no need to catch up on missed days.",
        evidence: [],
      });
    }
  }

  const order: Record<Severity, number> = { act: 0, notice: 1, gentle: 2, positive: 3 };
  signals.sort((a, c) => order[a.severity] - order[c.severity]);
  return { signals, ready: true };
}
