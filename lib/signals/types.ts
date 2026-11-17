
export type SignalKind = "sleep" | "resting_hr" | "hrv_rmssd" | "steps";

export const CANONICAL_UNIT: Record<SignalKind, string> = {
  sleep: "h", // a sleep segment's duration, in hours
  resting_hr: "bpm",
  hrv_rmssd: "ms",
  steps: "count",
};

export const ACCEPTED_UNITS: Record<SignalKind, Record<string, (v: number) => number>> = {
  sleep: { h: (v) => v, hours: (v) => v, min: (v) => v / 60, minutes: (v) => v / 60, s: (v) => v / 3600, seconds: (v) => v / 3600 },
  resting_hr: { bpm: (v) => v, "count/min": (v) => v },
  hrv_rmssd: { ms: (v) => v, s: (v) => v * 1000 },
  steps: { count: (v) => v, steps: (v) => v },
};

export const PLAUSIBLE: Record<SignalKind, [number, number]> = {
  sleep: [0.05, 16],
  resting_hr: [25, 220],
  hrv_rmssd: [1, 300],
  steps: [0, 100_000],
};

export interface RawReading {
  id?: string;
  kind: string;
  value: number;
  unit: string;
  start: string;
  end: string;
  tzOffsetMinutes?: number;
  timeZone?: string;
}

export interface Reading {
  provider: string;
  externalId: string;
  kind: SignalKind;
  value: number;
  start: string; // ISO UTC
  end: string; // ISO UTC
  tzOffsetMinutes: number | null;
}

export type ProviderStatus = "implemented" | "oauth" | "demo" | "not-implemented";

export interface SyncContext { userId: number; since: Date; until: Date; isDemoAccount: boolean }

export interface SignalProvider {
  id: string;
  name: string;
  status: ProviderStatus;
  kinds: SignalKind[];
  description: string;
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
