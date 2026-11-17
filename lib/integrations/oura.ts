import type { OAuthProvider, FetchCtx } from "./types";
import { ProviderHttpError } from "./types";
import type { RawReading } from "../signals/types";

const API = "https://api.ouraring.com";

interface OuraSleep {
  id?: unknown; bedtime_start?: unknown; bedtime_end?: unknown; total_sleep_duration?: unknown;
  lowest_heart_rate?: unknown; average_hrv?: unknown; type?: unknown;
}

const isoWithOffset = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(v);
const dateOnly = (d: Date) => d.toISOString().slice(0, 10);

export function normaliseOuraSleep(rec: OuraSleep): { readings: RawReading[]; rejected: boolean } {
  if (typeof rec.id !== "string" || !isoWithOffset(rec.bedtime_start) || !isoWithOffset(rec.bedtime_end)) return { readings: [], rejected: true };
  const start = rec.bedtime_start as string, end = rec.bedtime_end as string;
  const out: RawReading[] = [];
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
