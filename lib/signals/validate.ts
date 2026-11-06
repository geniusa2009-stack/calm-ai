import crypto from "node:crypto";
import { ACCEPTED_UNITS, PLAUSIBLE, type RawReading, type Reading, type SignalKind } from "./types";
import { canonicalTimeZone, tzOffsetMinutes } from "../time";

const KINDS = Object.keys(ACCEPTED_UNITS) as SignalKind[];
export const MAX_FUTURE_MS = 15 * 60e3; // tolerate small clock skew only
export const MAX_AGE_DAYS = 730;
const MAX_SEGMENT_HOURS: Record<SignalKind, number> = { sleep: 16, resting_hr: 24, hrv_rmssd: 24, steps: 24 };

export type Validated = { ok: true; reading: Reading } | { ok: false; reason: string };

function parseTime(v: unknown) {
  if (typeof v !== "string" || v.length > 40) return null;
  // Require an explicit offset or Z so readings can't silently shift by the server's zone.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(v)) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

/** Validate and normalise one untrusted reading. Never clamps: bad data is rejected with a reason. */
export function validateReading(raw: unknown, provider: string, now = Date.now()): Validated {
  if (!raw || typeof raw !== "object") return { ok: false, reason: "not an object" };
  const r = raw as Partial<RawReading>;
  if (typeof r.kind !== "string" || !KINDS.includes(r.kind as SignalKind)) return { ok: false, reason: `unknown kind "${String(r.kind).slice(0, 30)}"` };
  const kind = r.kind as SignalKind;
  if (typeof r.value !== "number" || !Number.isFinite(r.value)) return { ok: false, reason: "value must be a finite number" };
  const conv = typeof r.unit === "string" ? ACCEPTED_UNITS[kind][r.unit.trim()] : undefined;
  if (!conv) return { ok: false, reason: `unit "${String(r.unit).slice(0, 20)}" not accepted for ${kind}` };
  const value = conv(r.value);
  const [lo, hi] = PLAUSIBLE[kind];
  if (value < lo || value > hi) return { ok: false, reason: `${kind} value ${Math.round(value * 100) / 100} outside plausible range ${lo}–${hi}` };

  const start = parseTime(r.start), end = parseTime(r.end);
  if (start == null || end == null) return { ok: false, reason: "start/end must be ISO-8601 with a timezone offset" };
  if (end < start) return { ok: false, reason: "end is before start" };
  if ((end - start) / 3600e3 > MAX_SEGMENT_HOURS[kind]) return { ok: false, reason: "interval too long" };
  if (kind === "sleep" && Math.abs((end - start) / 3600e3 - value) > 0.25) return { ok: false, reason: "sleep duration doesn't match its interval" };
  if (end > now + MAX_FUTURE_MS) return { ok: false, reason: "reading is in the future" };
  if (end < now - MAX_AGE_DAYS * 864e5) return { ok: false, reason: "reading is too old" };

  let tz: number | null = null;
  if (r.timeZone !== undefined) {
    const zone = canonicalTimeZone(r.timeZone);
    if (!zone) return { ok: false, reason: "timeZone must be an IANA zone such as Africa/Cairo" };
    tz = tzOffsetMinutes(end, zone); // exact offset at that moment, DST included
    if (r.tzOffsetMinutes !== undefined && r.tzOffsetMinutes !== tz) return { ok: false, reason: "timeZone and tzOffsetMinutes disagree" };
  } else if (r.tzOffsetMinutes !== undefined) {
    if (typeof r.tzOffsetMinutes !== "number" || !Number.isInteger(r.tzOffsetMinutes) || Math.abs(r.tzOffsetMinutes) > 14 * 60) {
      return { ok: false, reason: "tzOffsetMinutes must be an integer within ±840" };
    }
    tz = r.tzOffsetMinutes;
  }

  let externalId: string;
  if (r.id !== undefined) {
    if (typeof r.id !== "string" || !r.id.trim() || r.id.length > 200) return { ok: false, reason: "id must be a non-empty string ≤200 chars" };
    externalId = r.id.trim();
  } else {
    // No source id: derive one from content, so an identical re-delivery is a duplicate.
    externalId = "h:" + crypto.createHash("sha256").update(`${kind}|${start}|${end}|${value}`).digest("hex").slice(0, 32);
  }

  return {
    ok: true,
    reading: { provider, externalId, kind, value: Math.round(value * 1000) / 1000, start: new Date(start).toISOString(), end: new Date(end).toISOString(), tzOffsetMinutes: tz },
  };
}
