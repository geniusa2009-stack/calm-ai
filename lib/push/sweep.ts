import { db } from "../db";
import { snapshot } from "../snapshot";
import { dueReminders } from "./schedule";
import { sendToUser, vapidConfig, type Sender } from "./send";
import { localDate as toLocalDate, resolveTimeZone } from "../time";

/**
 * One scheduler pass over users who opted in and have a subscription. Run every 15–30 min
 * from cron (`npm run push:sweep`). Duplicate-safe: the (user, kind, local_date) row is
 * claimed BEFORE sending, so overlapping runs cannot both send.
 */
export async function runSweep(now = new Date(), send?: Sender) {
  const summary = { users: 0, sent: 0, skipped: 0, removed: 0, failed: 0 };
  if (!vapidConfig()) return { ...summary, configured: false };
  const users = db().prepare(`SELECT DISTINCT s.user_id AS id FROM push_subscriptions s
    JOIN settings st ON st.user_id = s.user_id AND st.key = 'notifyEnabled' AND st.value = 'true'`).all() as { id: number }[];
  for (const { id } of users) {
    summary.users++;
    const snap = snapshot(id, now);
    const today = toLocalDate(now, resolveTimeZone(snap.settings.timezone));
    const { localDate, due } = dueReminders({
      settings: snap.settings, now, checkedInToday: snap.checkedInToday,
      radarNotice: snap.radar.signals.some((s) => s.severity === "notice" || s.severity === "act"),
      sentToday: (db().prepare("SELECT kind FROM push_deliveries WHERE user_id = ? AND local_date = ?").all(id, today) as { kind: string }[]).map((r) => r.kind),
    });
    for (const d of due) {
      const claimed = db().prepare("INSERT OR IGNORE INTO push_deliveries (user_id, kind, local_date, sent_at, outcome) VALUES (?,?,?,?, 'pending')")
        .run(id, d.kind, localDate, now.toISOString()).changes === 1;
      if (!claimed) { summary.skipped++; continue; }
      const r = await sendToUser(id, d.payload, send);
      summary.sent += r.sent; summary.removed += r.removed; summary.failed += r.failed;
      db().prepare("UPDATE push_deliveries SET outcome = ? WHERE user_id = ? AND kind = ? AND local_date = ?")
        .run(r.sent ? "sent" : "failed", id, d.kind, localDate);
    }
  }
  return { ...summary, configured: true };
}
