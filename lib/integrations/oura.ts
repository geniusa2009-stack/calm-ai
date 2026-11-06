import type { OAuthProvider, FetchCtx } from "./types";
import { ProviderHttpError } from "./types";
import type { RawReading } from "../signals/types";

/**
 * Oura Ring (API v2, OAuth2).
 *
 * STATUS: implemented, NOT externally verified. The endpoints, field names and scope names
 * below follow Oura's v2 API as described in secondary sources; the official documentation
 * host (cloud.ouraring.com) could not be reached from the development environment. Before
 * enabling in production, confirm each item against https://cloud.ouraring.com/v2/docs and
 * set `externallyVerified: true` only after a successful sandbox/test-account sync.
 *
 * Data minimisation: only the `daily` scope is requested (sleep periods, which include the
 * lowest heart rate and average HRV). No email, personal, workout, tag, session or SpO2 data.
 */
const API = "https://api.ouraring.com";

interface OuraSleep {
  id?: unknown; bedtime_start?: unknown; bedtime_end?: unknown; total_sleep_duration?: unknown;
  lowest_heart_rate?: unknown; average_hrv?: unknown; type?: unknown;
}

const isoWithOffset = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(v);
const dateOnly = (d: Date) => d.toISOString().slice(0, 10);

/** Pure: Oura sleep period → Calm raw readings. Anything malformed is counted, not guessed. */
export function normaliseOuraSleep(rec: OuraSleep): { readings: RawReading[]; rejected: boolean } {
  if (typeof rec.id !== "string" || !isoWithOffset(rec.bedtime_start) || !isoWithOffset(rec.bedtime_end)) return { readings: [], rejected: true };
  const start = rec.bedtime_start as string, end = rec.bedtime_end as string;
  const out: RawReading[] = [];
  // Oura's total_sleep_duration (seconds asleep) is shorter than time in bed; Calm's sleep reading
  // is a segment whose duration must equal its interval, so we record the in-bed interval as a
  // sleep segment only when they agree within 15 minutes, and otherwise keep HR/HRV only.
  const asleep = typeof rec.total_sleep_duration === "number" ? rec.total_sleep_duration : null;
  const inBedSec = (Date.parse(end) - Date.parse(start)) / 1000;
  if (asleep != null && Math.abs(inBedSec - asleep) <= 900) {
    out.push({ id: `oura-sleep-${rec.id}`, kind: "sleep", value: inBedSec, unit: "s", start, end });
  }
  if (typeof rec.lowest_heart_rate === "number") out.push({ id: `oura-rhr-${rec.id}`, kind: "resting_hr", value: rec.lowest_heart_rate, unit: "bpm", start, end });
  if (typeof rec.average_hrv === "number") out.push({ id: `oura-hrv-${rec.id}`, kind: "hrv_rmssd", value: rec.average_hrv, unit: "ms", start, end });
  return { readings: out, rejected: false };
}

export const oura: OAuthProvider = {
  id: "oura",
  name: "Oura",
  authorizeUrl: "https://cloud.ouraring.com/oauth/authorize",
  tokenUrl: `${API}/oauth/token`,
  revokeUrl: `${API}/oauth/revoke`,
  scopes: ["daily"],
  pkce: true,
  clientIdEnv: "OURA_CLIENT_ID",
  clientSecretEnv: "OURA_CLIENT_SECRET",
  docs: "https://cloud.ouraring.com/v2/docs",
  externallyVerified: false,
  async fetchPage({ accessToken, since, until, cursor, fetch }: FetchCtx) {
    const q = new URLSearchParams({ start_date: dateOnly(since), end_date: dateOnly(until) });
    if (cursor) q.set("next_token", cursor);
    const res = await fetch(`${API}/v2/usercollection/sleep?${q}`, { headers: { authorization: `Bearer ${accessToken}` } });
    if (!res.ok) {
      const ra = Number(res.headers.get("retry-after"));
      throw new ProviderHttpError(res.status, Number.isFinite(ra) && ra > 0 ? ra : null, `oura ${res.status}`);
    }
    const body = (await res.json()) as { data?: unknown; next_token?: unknown };
    const rows = Array.isArray(body.data) ? body.data : [];
    let rejected = 0;
    const readings = rows.flatMap((r) => { const n = normaliseOuraSleep((r ?? {}) as OuraSleep); if (n.rejected) rejected++; return n.readings; });
    return { readings, nextCursor: typeof body.next_token === "string" && body.next_token ? body.next_token : null, rejected };
  },
};
