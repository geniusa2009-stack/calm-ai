/**
 * Provider-agnostic boundary for passive signals (wearables, phone sensors, exports).
 *
 * A provider turns some source into RawReadings. Everything after that — validation,
 * unit normalisation, de-duplication, storage, daily aggregation — is shared, so a new
 * provider only has to implement `fetchReadings` (pull) or feed the import endpoint (push).
 */

export type SignalKind = "sleep" | "resting_hr" | "hrv_rmssd" | "steps";

/** Canonical units stored in the database. */
export const CANONICAL_UNIT: Record<SignalKind, string> = {
  sleep: "h", // a sleep segment's duration, in hours
  resting_hr: "bpm",
  hrv_rmssd: "ms",
  steps: "count",
};

/** Units accepted on input, with a converter to the canonical unit. */
export const ACCEPTED_UNITS: Record<SignalKind, Record<string, (v: number) => number>> = {
  sleep: { h: (v) => v, hours: (v) => v, min: (v) => v / 60, minutes: (v) => v / 60, s: (v) => v / 3600, seconds: (v) => v / 3600 },
  resting_hr: { bpm: (v) => v, "count/min": (v) => v },
  hrv_rmssd: { ms: (v) => v, s: (v) => v * 1000 },
  steps: { count: (v) => v, steps: (v) => v },
};

/** Physiologically plausible bounds in canonical units; outside = rejected, not clamped. */
export const PLAUSIBLE: Record<SignalKind, [number, number]> = {
  sleep: [0.05, 16],
  resting_hr: [25, 220],
  hrv_rmssd: [1, 300],
  steps: [0, 100_000],
};

/** What a provider hands to the pipeline. Untrusted until validated. */
export interface RawReading {
  /** Stable id from the source, used for de-duplication. Optional: derived if absent. */
  id?: string;
  kind: string;
  value: number;
  unit: string;
  /** ISO-8601 with offset, e.g. 2026-11-04T23:10:00+01:00 */
  start: string;
  end: string;
  /** Device's UTC offset in minutes, so a reading is attributed to the person's local day. */
  tzOffsetMinutes?: number;
}

/** A validated reading in canonical units. */
export interface Reading {
  provider: string;
  externalId: string;
  kind: SignalKind;
  value: number;
  start: string; // ISO UTC
  end: string; // ISO UTC
  tzOffsetMinutes: number | null;
}

export type ProviderStatus = "implemented" | "demo" | "not-implemented";

export interface SyncContext { userId: number; since: Date; until: Date; isDemoAccount: boolean }

export interface SignalProvider {
  id: string;
  name: string;
  status: ProviderStatus;
  kinds: SignalKind[];
  /** What the user is told about this provider — must be accurate. */
  description: string;
  /** Pull-style sync. Absent for push-only providers (e.g. file import) and unimplemented ones. */
  fetchReadings?: (ctx: SyncContext) => Promise<RawReading[]>;
}

export interface IngestReport {
  received: number;
  inserted: number;
  updated: number; // same id, corrected value
  duplicates: number; // identical re-delivery
  rejected: { index: number; reason: string }[];
  latestEnd: string | null;
  maxDelayHours: number | null; // how late the most-delayed accepted reading arrived
}
