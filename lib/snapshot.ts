import { getSettings, insightFeedback, listCheckIns, listCircle, listMemories, listSessions, type UserId } from "./db";
import { groupByDay, daysBetween, localDate } from "./engine/days";
import { dailySignals, mergeSignals } from "./signals/daily";
import { listReadings } from "./signals/store";
import { computePulse } from "./engine/pulse";
import { scanRadar, type Signal } from "./engine/radar";
import { recommend } from "./engine/support";
import { weeklyInsights } from "./engine/insights";
import { recoveryProfile } from "./engine/recovery";
import { strainSeries } from "./engine/pulse";
import { MODES } from "./modes";
import { localParts, resolveTimeZone } from "./time";
import type { Settings } from "./types";

export interface Nudge { id: string; tone: "info" | "care" | "celebrate"; text: string; href: string; cta: string }

export function inQuietHours(s: Pick<Settings, "quietStart" | "quietEnd">, hour: number) {
  return s.quietStart > s.quietEnd ? hour >= s.quietStart || hour < s.quietEnd : hour >= s.quietStart && hour < s.quietEnd;
}

/** Everything the app needs to render "today", computed once per request. */
export function snapshot(uid: UserId, now = new Date()) {
  const settings = getSettings(uid);
  // Every "what day / what hour is it" question below is answered in the person's zone.
  const tz = resolveTimeZone(settings.timezone);
  const checkins = listCheckIns(uid, 120);
  const sessions = listSessions(uid, 180);
  // Passive signals only fill missing self-reported sleep (see lib/signals/daily.ts).
  const days = mergeSignals(groupByDay(checkins, tz), dailySignals(listReadings(uid, 120), tz));
  const pulse = computePulse(days, now, tz);
  const radar = scanRadar(days, now, MODES[settings.mode].radarSensitivity, tz);
  const recommendations = recommend(pulse.state, sessions, settings.mode, now, tz);
  const today = localDate(now, tz);
  const checkedInToday = days.at(-1)?.date === today;

  // Smart nudges: few, relevant, respectful of quiet hours and mode.
  const nudges: Nudge[] = [];
  const quiet = inQuietHours(settings, localParts(now, tz).hour);
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
    settings, tz, mode: MODES[settings.mode], days, checkins, sessions, pulse, radar, recommendations,
    nudges: nudges.slice(0, MODES[settings.mode].nudgesPerDay + (checkedInToday ? 0 : 1)),
    checkedInToday, suggestProfessional, hardDays14: hardDays,
  };
}

export function patternsSnapshot(uid: UserId, now = new Date()) {
  const base = snapshot(uid, now);
  return {
    ...base,
    insights: weeklyInsights(base.days, base.sessions, insightFeedback(uid), now, base.tz),
    recovery: recoveryProfile(base.days, base.sessions, base.tz),
    series: strainSeries(base.days),
    memories: listMemories(uid),
    circle: listCircle(uid),
  };
}
