import type { Settings } from "../types";
import { localParts, resolveTimeZone } from "../time";
import { inQuietHours } from "../snapshot";
import { MAX_PER_DAY, REMINDER_TEXT, type NudgeKind } from "../device/reminders";
import type { PushPayload } from "./send";

export interface DueInput {
  settings: Pick<Settings, "timezone" | "quietStart" | "quietEnd" | "notifyEnabled" | "pushCheckin" | "pushRadar" | "reminderHour">;
  now: Date;
  checkedInToday: boolean;
  radarNotice: boolean; // a "notice"/"act" radar signal exists today
  sentToday: string[]; // kinds already delivered on this local date
}

export function dueReminders(i: DueInput): { localDate: string; due: { kind: NudgeKind; payload: PushPayload }[] } {
  const tz = resolveTimeZone(i.settings.timezone);
  const p = localParts(i.now, tz);
  if (!i.settings.notifyEnabled || inQuietHours(i.settings, p.hour)) return { localDate: p.date, due: [] };
  const due: NudgeKind[] = [];
  if (i.settings.pushCheckin && !i.checkedInToday && p.hour >= i.settings.reminderHour) due.push("checkin");
  if (i.settings.pushRadar && i.radarNotice) due.push("radar");
  const remaining = Math.max(0, MAX_PER_DAY - i.sentToday.length);
  return {
    localDate: p.date,
    due: due.filter((k) => !i.sentToday.includes(k)).slice(0, remaining).map((kind) => ({ kind, payload: { ...REMINDER_TEXT[kind], tag: `calm-${kind}` } })),
  };
}
