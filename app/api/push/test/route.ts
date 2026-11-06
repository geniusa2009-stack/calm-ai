import { db } from "@/lib/db";
import { sendToUser, vapidConfig } from "@/lib/push/send";
import { json, route } from "@/lib/http";

/** Sends a generic test push to the caller's own devices. At most once a minute. */
export const POST = route(async (_req, { user }) => {
  if (!vapidConfig()) return json({ error: "Push isn't configured on this server." }, { status: 503 });
  const minute = new Date().toISOString().slice(0, 16);
  const ok = db().prepare("INSERT OR IGNORE INTO push_deliveries (user_id, kind, local_date, sent_at, outcome) VALUES (?, 'test', ?, ?, 'pending')").run(user.id, minute, new Date().toISOString()).changes === 1;
  if (!ok) return json({ error: "One test a minute, please." }, { status: 429 });
  const r = await sendToUser(user.id, { title: "Calm", body: "This is what a reminder looks like.", tag: "calm-test" });
  return { ...r };
});
