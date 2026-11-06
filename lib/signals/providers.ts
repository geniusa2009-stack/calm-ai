import type { RawReading, SignalProvider, SyncContext } from "./types";

/**
 * Provider registry. `status` is shown to users verbatim — keep it truthful.
 * Only "implemented" and "demo" providers can produce data.
 */

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/** Deterministic synthetic signals. Only ever runs for demo accounts. */
export const demoProvider: SignalProvider = {
  id: "demo",
  name: "Demo wearable",
  status: "demo",
  kinds: ["sleep", "resting_hr", "hrv_rmssd", "steps"],
  description: "Synthetic data for demo accounts only. Not a real device.",
  async fetchReadings(ctx: SyncContext): Promise<RawReading[]> {
    if (!ctx.isDemoAccount) throw new Error("The demo provider is only available in demo accounts.");
    const r = rng(ctx.userId * 7919);
    const out: RawReading[] = [];
    for (let t = new Date(ctx.since); t < ctx.until; t = new Date(t.getTime() + 864e5)) {
      const day = t.toISOString().slice(0, 10);
      const hours = 6.2 + r() * 2;
      const wake = new Date(`${day}T06:30:00Z`).getTime() + r() * 3600e3;
      if (wake > ctx.until.getTime()) break;
      out.push({ id: `demo-sleep-${day}`, kind: "sleep", value: Math.round(hours * 60), unit: "min", start: new Date(wake - hours * 3600e3).toISOString(), end: new Date(wake).toISOString(), tzOffsetMinutes: 0 });
      out.push({ id: `demo-rhr-${day}`, kind: "resting_hr", value: Math.round(58 + r() * 8), unit: "bpm", start: new Date(wake - 3600e3).toISOString(), end: new Date(wake).toISOString(), tzOffsetMinutes: 0 });
      out.push({ id: `demo-hrv-${day}`, kind: "hrv_rmssd", value: Math.round(35 + r() * 30), unit: "ms", start: new Date(wake - 3600e3).toISOString(), end: new Date(wake).toISOString(), tzOffsetMinutes: 0 });
    }
    return out;
  },
};

/** Push-only: the user uploads readings they exported themselves. Implemented. */
export const fileImportProvider: SignalProvider = {
  id: "file-import",
  name: "File import (JSON)",
  status: "implemented",
  kinds: ["sleep", "resting_hr", "hrv_rmssd", "steps"],
  description: "Upload readings you exported from a device or app, in Calm's JSON format (see docs/SIGNALS.md).",
};

const planned = (id: string, name: string, note: string): SignalProvider => ({
  id, name, status: "not-implemented", kinds: ["sleep", "resting_hr", "hrv_rmssd", "steps"], description: note,
});

export const PROVIDERS: SignalProvider[] = [
  fileImportProvider,
  demoProvider,
  {
    id: "oura", name: "Oura", status: "oauth", kinds: ["sleep", "resting_hr", "hrv_rmssd"],
    description: "Connect with your Oura account (OAuth). Imports sleep periods, lowest heart rate and average HRV only. Needs Oura developer credentials on this server; not yet verified against Oura's live API.",
  },
  planned("apple-health", "Apple Health", "Not implemented. Requires a native iOS companion app (HealthKit has no web API). The data contract is defined; see docs/wearable-integrations.md."),
  planned("health-connect", "Health Connect (Android)", "Not implemented. Requires a native Android companion app. The data contract is defined; see docs/wearable-integrations.md."),
  planned("fitbit", "Fitbit", "Not implemented. The legacy Fitbit Web API was switched off in November 2026; its replacement, the Google Health API, requires Google's restricted-scope review."),
  planned("garmin", "Garmin", "Not implemented. Requires Garmin Health API partner approval."),
];

export const providerById = (id: string) => PROVIDERS.find((p) => p.id === id);
