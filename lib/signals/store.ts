import { db, type UserId } from "../db";
import { validateReading } from "./validate";
import type { IngestReport, Reading, SignalKind } from "./types";

export const MAX_BATCH = 5000;

/**
 * Validate → normalise → upsert a batch. Idempotent: re-sending the same batch changes nothing.
 * Arrival order is irrelevant because daily values are always recomputed from storage.
 */
export function ingest(uid: UserId, provider: string, raw: unknown[], now = Date.now()): IngestReport {
  const report: IngestReport = { received: raw.length, inserted: 0, updated: 0, duplicates: 0, rejected: [], latestEnd: null, maxDelayHours: null };
  if (raw.length > MAX_BATCH) {
    report.rejected.push({ index: -1, reason: `batch too large (max ${MAX_BATCH})` });
    return report;
  }
  const receivedAt = new Date(now).toISOString();
  const find = db().prepare("SELECT value, start_ts, end_ts FROM signal_readings WHERE user_id = ? AND provider = ? AND external_id = ?");
  const insert = db().prepare(`INSERT INTO signal_readings (user_id, provider, external_id, kind, value, start_ts, end_ts, tz_offset_min, received_at)
                               VALUES (?,?,?,?,?,?,?,?,?)`);
  const update = db().prepare(`UPDATE signal_readings SET kind = ?, value = ?, start_ts = ?, end_ts = ?, tz_offset_min = ?, received_at = ?
                               WHERE user_id = ? AND provider = ? AND external_id = ?`);
  const seen = new Set<string>();

  db().transaction(() => {
    raw.forEach((r, index) => {
      const v = validateReading(r, provider, now);
      if (!v.ok) { report.rejected.push({ index, reason: v.reason }); return; }
      const x = v.reading;
      if (seen.has(x.externalId)) { report.duplicates++; return; } // duplicate within the batch
      seen.add(x.externalId);
      const existing = find.get(uid, provider, x.externalId) as { value: number; start_ts: string; end_ts: string } | undefined;
      if (!existing) { insert.run(uid, provider, x.externalId, x.kind, x.value, x.start, x.end, x.tzOffsetMinutes, receivedAt); report.inserted++; }
      else if (existing.value !== x.value || existing.start_ts !== x.start || existing.end_ts !== x.end) {
        update.run(x.kind, x.value, x.start, x.end, x.tzOffsetMinutes, receivedAt, uid, provider, x.externalId); report.updated++;
      } else { report.duplicates++; return; }
      if (!report.latestEnd || x.end > report.latestEnd) report.latestEnd = x.end;
      const delay = (now - Date.parse(x.end)) / 3600e3;
      report.maxDelayHours = Math.max(report.maxDelayHours ?? 0, Math.round(delay * 10) / 10);
    });
    db().prepare(`INSERT INTO signal_connections (user_id, provider, last_sync_at, last_report) VALUES (?,?,?,?)
                  ON CONFLICT(user_id, provider) DO UPDATE SET last_sync_at = excluded.last_sync_at, last_report = excluded.last_report`)
      .run(uid, provider, receivedAt, JSON.stringify({ ...report, rejected: report.rejected.length }));
  })();
  return report;
}

export function listReadings(uid: UserId, sinceDays = 120, kinds?: SignalKind[]): Reading[] {
  const since = new Date(Date.now() - sinceDays * 864e5).toISOString();
  const rows = db().prepare(`SELECT provider, external_id, kind, value, start_ts, end_ts, tz_offset_min FROM signal_readings
                             WHERE user_id = ? AND end_ts >= ? ORDER BY end_ts`).all(uid, since) as
    { provider: string; external_id: string; kind: SignalKind; value: number; start_ts: string; end_ts: string; tz_offset_min: number | null }[];
  return rows
    .filter((r) => !kinds || kinds.includes(r.kind))
    .map((r) => ({ provider: r.provider, externalId: r.external_id, kind: r.kind, value: r.value, start: r.start_ts, end: r.end_ts, tzOffsetMinutes: r.tz_offset_min }));
}

export function connections(uid: UserId) {
  const rows = db().prepare("SELECT provider, last_sync_at, last_report FROM signal_connections WHERE user_id = ?").all(uid) as
    { provider: string; last_sync_at: string | null; last_report: string | null }[];
  const counts = db().prepare("SELECT provider, COUNT(*) AS n FROM signal_readings WHERE user_id = ? GROUP BY provider").all(uid) as { provider: string; n: number }[];
  return rows.map((r) => ({ provider: r.provider, lastSyncAt: r.last_sync_at, lastReport: r.last_report ? JSON.parse(r.last_report) : null, readings: counts.find((c) => c.provider === r.provider)?.n ?? 0 }));
}

export function removeProviderData(uid: UserId, provider: string) {
  db().transaction(() => {
    db().prepare("DELETE FROM signal_readings WHERE user_id = ? AND provider = ?").run(uid, provider);
    db().prepare("DELETE FROM signal_connections WHERE user_id = ? AND provider = ?").run(uid, provider);
  })();
}
