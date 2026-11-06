import type { Day } from "../engine/days";
import { localDate } from "../engine/days";
import { FALLBACK_TZ } from "../time";
import { median } from "../engine/stats";
import type { Reading, SignalKind } from "./types";

export interface DailySignals {
  date: string;
  sleepHours?: number;
  restingHr?: number;
  hrvRmssd?: number;
  steps?: number;
  sources: Partial<Record<SignalKind, string>>; // which provider each value came from
}

/**
 * The person's local calendar day for an instant: the device's own offset at the time of the
 * reading if the source provided one (or an IANA zone, converted at ingest), otherwise the
 * user's current zone. Never the server's zone.
 */
export function attributionDate(iso: string, tzOffsetMinutes: number | null, userTz: string = FALLBACK_TZ) {
  if (tzOffsetMinutes == null) return localDate(iso, userTz);
  return new Date(Date.parse(iso) + tzOffsetMinutes * 60e3).toISOString().slice(0, 10);
}

/** Total length of a set of intervals with overlaps counted once (ms). */
export function unionLength(intervals: [number, number][]) {
  const xs = [...intervals].sort((a, b) => a[0] - b[0]);
  let total = 0, curS = -Infinity, curE = -Infinity;
  for (const [s, e] of xs) {
    if (s > curE) { if (curE > curS) total += curE - curS; curS = s; curE = e; }
    else curE = Math.max(curE, e);
  }
  if (curE > curS) total += curE - curS;
  return total;
}

/**
 * Aggregate readings to one value per kind per local day. Pure: same readings in any
 * order → same result, so out-of-order and delayed arrivals are handled by construction.
 *
 *  - sleep: segments are attributed to the day you woke up (segment end); overlapping
 *    segments within a provider are merged, never double counted
 *  - resting HR / HRV: median of that day's readings
 *  - steps: summed per provider (non-overlapping intervals assumed per provider)
 *  - several providers for the same kind/day: the one with the most coverage wins,
 *    ties broken by provider id — providers are never summed together
 */
export function dailySignals(readings: Reading[], userTz: string = FALLBACK_TZ): Map<string, DailySignals> {
  const groups = new Map<string, Map<SignalKind, Map<string, Reading[]>>>();
  for (const r of readings) {
    const date = attributionDate(r.end, r.tzOffsetMinutes, userTz);
    const byKind = groups.get(date) ?? groups.set(date, new Map()).get(date)!;
    const byProv = byKind.get(r.kind) ?? byKind.set(r.kind, new Map()).get(r.kind)!;
    (byProv.get(r.provider) ?? byProv.set(r.provider, []).get(r.provider)!).push(r);
  }
  const out = new Map<string, DailySignals>();
  for (const [date, byKind] of groups) {
    const d: DailySignals = { date, sources: {} };
    for (const [kind, byProv] of byKind) {
      const candidates = [...byProv.entries()].map(([prov, rs]) => {
        let value: number;
        if (kind === "sleep") value = unionLength(rs.map((r) => [Date.parse(r.start), Date.parse(r.end)])) / 3600e3;
        else if (kind === "steps") value = rs.reduce((a, r) => a + r.value, 0);
        else value = median(rs.map((r) => r.value));
        return { prov, value, coverage: rs.length };
      }).sort((a, b) => b.coverage - a.coverage || (a.prov < b.prov ? -1 : 1));
      const best = candidates[0];
      const v = Math.round(best.value * 100) / 100;
      if (kind === "sleep") d.sleepHours = v;
      if (kind === "resting_hr") d.restingHr = v;
      if (kind === "hrv_rmssd") d.hrvRmssd = v;
      if (kind === "steps") d.steps = Math.round(best.value);
      d.sources[kind] = best.prov;
    }
    out.set(date, d);
  }
  return out;
}

/**
 * Merge passive signals into check-in days. Deliberately conservative:
 *  - self-reported sleep always wins; wearable sleep only fills a missing value
 *  - signals never create a day on their own (the engine needs a check-in)
 *  - resting HR / HRV / steps are attached for display/export but are NOT used by
 *    the Pulse or Radar until their contribution has been validated
 */
export function mergeSignals(days: Day[], daily: Map<string, DailySignals>): (Day & { sleepSource?: string; signals?: DailySignals })[] {
  return days.map((d) => {
    const s = daily.get(d.date);
    if (!s) return d;
    const fill = d.sleepHours == null && s.sleepHours != null;
    return { ...d, sleepHours: fill ? s.sleepHours! : d.sleepHours, sleepSource: fill ? s.sources.sleep : d.sleepHours != null ? "self-report" : undefined, signals: s };
  });
}
