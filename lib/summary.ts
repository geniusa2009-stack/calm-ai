import { groupByDay, daysBetween, localDate } from "./engine/days";
import { computePulse } from "./engine/pulse";
import { tagEffects, sleepLinks, prettyTag } from "./engine/context";
import { recoveryProfile } from "./engine/recovery";
import { toolEfficacy, toolById } from "./engine/support";
import { scanRadar } from "./engine/radar";
import { mean, round } from "./engine/stats";
import type { CheckIn, Memory, SupportSession } from "./types";

/**
 * Plain-language summary of the person's recent wellbeing data.
 * Used for (a) the Professional Bridge export a person may choose to share
 * and (b) context for the optional AI companion. Never includes contacts.
 */
export function buildSummary(checkins: CheckIn[], sessions: SupportSession[], memories: Memory[], now = new Date(), tz = "UTC") {
  const days = groupByDay(checkins, tz);
  const asOf = localDate(now, tz);
  const pulse = computePulse(days, now, tz);
  const last14 = days.filter((d) => daysBetween(d.date, asOf) < 14);
  const lines: string[] = [];
  lines.push(`Current state: ${pulse.label} (${pulse.confidenceText}).`);
  if (pulse.drivers.length) lines.push(`Main drivers: ${pulse.drivers.map((d) => d.text).join("; ")}.`);
  const b = pulse.baseline;
  lines.push(`Personal usual: stress ${round(b.stress.center)}/10, mood ${round(b.mood.center)}/10, energy ${round(b.energy.center)}/10, sleep ${round(b.sleepHours.center)}h.`);
  if (last14.length) {
    lines.push(`Last 14 days (${last14.length} check-ins): avg stress ${round(mean(last14.map((d) => d.stress)))}, mood ${round(mean(last14.map((d) => d.mood)))}, energy ${round(mean(last14.map((d) => d.energy)))}` +
      (last14.some((d) => d.sleepHours != null) ? `, sleep ${round(mean(last14.filter((d) => d.sleepHours != null).map((d) => d.sleepHours!)))}h.` : "."));
  }
  const radar = scanRadar(days, now, 1, tz);
  if (radar.signals.length) lines.push(`Recent shifts noticed: ${radar.signals.map((s) => s.title).join("; ")}.`);
  const fx = tagEffects(days).filter((e) => e.confidence !== "low").slice(0, 4);
  if (fx.length) lines.push(`Patterns: ${fx.map((e) => e.text).join(" ")}`);
  const sl = sleepLinks(days);
  if (sl.length) lines.push(sl[0].text);
  const rec = recoveryProfile(days, sessions, tz);
  lines.push(`Recovery: ${rec.text}`);
  const eff = Object.values(toolEfficacy(sessions)).filter((e) => e.sessions >= 2).sort((a, c) => c.score - a.score).slice(0, 2);
  if (eff.length) lines.push(`Support that has helped: ${eff.map((e) => `${toolById(e.tool)!.name} (avg drop ${e.avgDrop ?? "n/a"}, ${e.sessions} sessions)`).join(", ")}.`);
  const pinned = memories.filter((m) => m.pinned || m.kind === "helped").slice(0, 6);
  if (pinned.length) lines.push(`Things they've noted: ${pinned.map((m) => `“${m.text}”`).join(" ")}`);
  return { text: lines.join("\n"), pulse, tagsUsed: [...new Set(days.flatMap((d) => d.tags))].map(prettyTag) };
}
