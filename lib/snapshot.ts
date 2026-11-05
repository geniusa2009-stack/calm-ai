import { getSettings, insightFeedback, listCheckIns, listCircle, listMemories, listSessions, type UserId } from "./db";
import { groupByDay, daysBetween, localDate } from "./engine/days";
import { computePulse } from "./engine/pulse";
import { scanRadar, type Signal } from "./engine/radar";
import { recommend } from "./engine/support";
import { weeklyInsights } from "./engine/insights";
import { recoveryProfile } from "./engine/recovery";
import { strainSeries } from "./engine/pulse";
import { MODES } from "./modes";
import type { Settings } from "./types";

export interface Nudge { id: string; tone: "info" | "care" | "celebrate"; text: string; href: string; cta: string }

function inQuietHours(s: Settings, hour: number) {
  return s.quietStart > s.quietEnd ? hour >= s.quietStart || hour < s.quietEnd : hour >= s.quietStart && hour < s.quietEnd;
}

/** Everything the app needs to render "today", computed once per request. */
export function snapshot(uid: UserId, now = new Date()) {
  const settings = getSettings(uid);
  const checkins = listCheckIns(uid, 120);
  const sessions = listSessions(uid, 180);
  const days = groupByDay(checkins);
  const pulse = computePulse(days, now);
  const radar = scanRadar(days, now, MODES[settings.mode].radarSensitivity);
  const recommendations = recommend(pulse.state, sessions, settings.mode, now);
  const today = localDate(now);
  const checkedInToday = days.at(-1)?.date === today;

  // Smart nudges: few, relevant, respectful of quiet hours and mode.
  const nudges: Nudge[] = [];
  const quiet = inQuietHours(settings, now.getHours());
  if (settings.nudgesEnabled && !quiet) {
    if (!checkedInToday) nudges.push({ id: "checkin", tone: "info", text: pulse.stage === "learning" ? "A quick check-in helps Calm learn your usual." : "How are you doing today? 20 seconds is enough.", href: "/check-in", cta: "Check in" });
    const top = radar.signals.find((s: Signal) => s.severity === "act" || s.severity === "notice");
    if (top) nudges.push({ id: `radar:${top.id}`, tone: "care", text: top.title + ". " + top.suggestion, href: "/#radar", cta: "See why" });
    const pos = radar.signals.find((s) => s.severity === "positive");
    if (pos) nudges.push({ id: `pos:${pos.id}`, tone: "celebrate", text: pos.title + " — " + pos.suggestion, href: "/memory", cta: "Add a note" });
  }

  // Professional bridge: sustained difficulty over two weeks suggests talking to someone.
  const series = strainSeries(days.filter((d) => daysBetween(d.date, today) < 21)).filter((s) => daysBetween(s.date, today) < 14);
  const hardDays = series.filter((s) => s.strain >= 0.75).length;
  const suggestProfessional = series.length >= 8 && hardDays >= Math.max(8, Math.ceil(series.length * 0.65));

  return {
    settings, mode: MODES[settings.mode], days, checkins, sessions, pulse, radar, recommendations,
    nudges: nudges.slice(0, MODES[settings.mode].nudgesPerDay + (checkedInToday ? 0 : 1)),
    checkedInToday, suggestProfessional, hardDays14: hardDays,
  };
}

export function patternsSnapshot(uid: UserId, now = new Date()) {
  const base = snapshot(uid, now);
  return {
    ...base,
    insights: weeklyInsights(base.days, base.sessions, insightFeedback(uid), now),
    recovery: recoveryProfile(base.days, base.sessions),
    series: strainSeries(base.days),
    memories: listMemories(uid),
    circle: listCircle(uid),
  };
}
