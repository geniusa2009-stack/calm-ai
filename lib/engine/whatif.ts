import type { Day } from "./days";
import { daysBetween, localDate } from "./days";
import type { SupportSession } from "../types";
import { tagEffects, sleepLinks, prettyTag } from "./context";
import { toolEfficacy } from "./support";
import { clamp, mean, round } from "./stats";

export interface Scenario {
  sleepDelta: number; // hours per night
  reduceTags: string[]; // tags you'd do less (half as often)
  addTags: string[]; // tags you'd add ~3x/week
  dailySupport: boolean;
}

export interface Projection {
  metric: "stress" | "mood" | "energy";
  current: number;
  projected: number;
  low: number;
  high: number;
}

export interface WhatIfResult { ready: boolean; projections: Projection[]; basis: string[]; caveat: string }

/**
 * Exploratory only. Combines the person's own learned associations additively
 * and shrinks them, so the output is a rough direction — not a forecast.
 */
export function whatIf(days: Day[], sessions: SupportSession[], s: Scenario, now = new Date(), tz?: string): WhatIfResult {
  const caveat = "These are rough, exploratory estimates built from patterns in your own data. Associations aren't guaranteed causes, and real life is noisier.";
  if (days.length < 14) return { ready: false, projections: [], basis: [], caveat: `The lab needs about two weeks of check-ins to learn your patterns (${days.length} days so far).` };

  const asOf = localDate(now, tz);
  const recent = days.filter((d) => daysBetween(d.date, asOf) < 14);
  const effects = tagEffects(days);
  const sleep = sleepLinks(days);
  const basis: string[] = [];
  const SHRINK = 0.5;
  const usable = effects.filter((e) => e.confidence !== "low");

  const delta = { stress: 0, mood: 0, energy: 0 };
  const spread = { stress: 0.4, mood: 0.4, energy: 0.4 };

  if (s.sleepDelta) {
    for (const l of sleep) {
      const effect = l.perHour * s.sleepDelta * SHRINK;
      delta[l.metric] += effect;
      spread[l.metric] += Math.abs(effect) * 0.5;
    }
    if (sleep.length) basis.push(`Your sleep ↔ next-day link (${sleep.map((l) => l.metric).join(", ")})`);
    else basis.push("No clear sleep link in your data yet, so sleep changes have little modelled effect.");
  }

  const freq = (tag: string) => recent.filter((d) => d.tags.includes(tag)).length / Math.max(recent.length, 1);
  for (const tag of s.reduceTags) {
    const f = freq(tag) / 2; // do it half as often
    for (const e of usable.filter((x) => x.tag === tag && x.metric !== "sleepHours")) {
      const effect = -e.diff * f * SHRINK;
      delta[e.metric as "stress"] += effect;
      spread[e.metric as "stress"] += Math.abs(effect) * 0.6;
      basis.push(`Less “${prettyTag(tag)}”: ${e.text}`);
    }
  }
  for (const tag of s.addTags) {
    const f = Math.max(0, 3 / 7 - freq(tag));
    for (const e of usable.filter((x) => x.tag === tag && x.metric !== "sleepHours")) {
      const effect = e.diff * f * SHRINK;
      delta[e.metric as "stress"] += effect;
      spread[e.metric as "stress"] += Math.abs(effect) * 0.6;
      basis.push(`More “${prettyTag(tag)}”: ${e.text}`);
    }
  }
  if (s.dailySupport) {
    const best = Object.values(toolEfficacy(sessions)).filter((e) => e.sessions >= 2).sort((a, b) => b.score - a.score)[0];
    if (best?.avgDrop) {
      // in-the-moment relief carries over only partially to daily averages
      const effect = -best.avgDrop * 0.2;
      delta.stress += effect;
      spread.stress += 0.3;
      basis.push(`A daily session of your most effective tool (avg in-the-moment drop ${best.avgDrop})`);
    } else basis.push("Not enough support sessions yet to estimate their daily effect.");
  }

  const projections = (["stress", "mood", "energy"] as const).map((metric) => {
    const current = mean(recent.map((d) => d[metric]));
    // Cap the combined shift: stacking associations overstates what changing habits does.
    const projected = clamp(current + clamp(delta[metric], -2, 2), 1, 10);
    return { metric, current: round(current), projected: round(projected), low: round(clamp(projected - spread[metric], 1, 10)), high: round(clamp(projected + spread[metric], 1, 10)) };
  });

  return { ready: true, projections, basis: [...new Set(basis)], caveat };
}
