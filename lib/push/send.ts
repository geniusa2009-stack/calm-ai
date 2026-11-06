import webpush from "web-push";
import { db, type UserId } from "../db";
import { subscriptionsFor } from "./store";

/**
 * Server-side Web Push delivery (VAPID, RFC 8292; payload encryption RFC 8291 via `web-push`).
 * Keys live in server env only: CALM_VAPID_PUBLIC_KEY, CALM_VAPID_PRIVATE_KEY, CALM_VAPID_SUBJECT.
 */
export const MAX_FAILURES = 5;

export function vapidConfig() {
  const publicKey = process.env.CALM_VAPID_PUBLIC_KEY, privateKey = process.env.CALM_VAPID_PRIVATE_KEY;
  const subject = process.env.CALM_VAPID_SUBJECT || "mailto:privacy@example.invalid";
  return publicKey && privateKey ? { publicKey, privateKey, subject } : null;
}

export interface PushPayload { title: string; body: string; tag: string }
export type Sender = (sub: webpush.PushSubscription, payload: string, opts: webpush.RequestOptions) => Promise<{ statusCode: number }>;
const defaultSender: Sender = (sub, payload, opts) => webpush.sendNotification(sub, payload, opts);

export interface DeliveryResult { sent: number; removed: number; failed: number }

/** Send to all of a user's subscriptions; prune gone (404/410) and repeatedly failing ones. */
export async function sendToUser(uid: UserId, payload: PushPayload, send: Sender = defaultSender): Promise<DeliveryResult> {
  const v = vapidConfig();
  if (!v) return { sent: 0, removed: 0, failed: 0 };
  const res: DeliveryResult = { sent: 0, removed: 0, failed: 0 };
  for (const s of subscriptionsFor(uid)) {
    try {
      await send({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), {
        vapidDetails: { subject: v.subject, publicKey: v.publicKey, privateKey: v.privateKey },
        TTL: 12 * 3600, urgency: "low", topic: payload.tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || "calm",
      });
      db().prepare("UPDATE push_subscriptions SET failures = 0, last_success_at = ? WHERE id = ?").run(new Date().toISOString(), s.id);
      res.sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410 || s.failures + 1 >= MAX_FAILURES) {
        db().prepare("DELETE FROM push_subscriptions WHERE id = ?").run(s.id); res.removed++;
      } else {
        db().prepare("UPDATE push_subscriptions SET failures = failures + 1 WHERE id = ?").run(s.id); res.failed++;
      }
      // Log status only — never the endpoint (a capability URL) or payload.
      console.error(`[push] delivery failed: ${code ?? "network"}`);
    }
  }
  return res;
}
