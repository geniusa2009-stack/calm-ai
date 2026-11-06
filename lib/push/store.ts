import { db, type UserId } from "../db";

export const MAX_SUBSCRIPTIONS_PER_USER = 10;
const MAX_NEW_PER_HOUR = 20;

export interface PushSub { endpoint: string; keys: { p256dh: string; auth: string } }
export class PushError extends Error { constructor(message: string, public status = 400) { super(message); } }

const b64urlBytes = (s: unknown) => (typeof s === "string" && /^[A-Za-z0-9_-]+={0,2}$/.test(s) ? Buffer.from(s, "base64url").length : -1);

/** Validate an untrusted PushSubscription JSON. Push services always use https. */
export function validateSubscription(raw: unknown): PushSub {
  const r = raw as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  if (!r || typeof r.endpoint !== "string" || r.endpoint.length > 2048) throw new PushError("Invalid subscription");
  let u: URL;
  try { u = new URL(r.endpoint); } catch { throw new PushError("Invalid subscription endpoint"); }
  if (u.protocol !== "https:" || !u.hostname.includes(".") || u.username || u.password) throw new PushError("Subscription endpoint must be an https push service URL");
  if (b64urlBytes(r.keys?.p256dh) !== 65) throw new PushError("Invalid p256dh key"); // uncompressed P-256 point
  if (b64urlBytes(r.keys?.auth) !== 16) throw new PushError("Invalid auth secret");
  return { endpoint: u.toString(), keys: { p256dh: r.keys!.p256dh as string, auth: r.keys!.auth as string } };
}

/**
 * Save a subscription for this user. An endpoint identifies one browser profile, so if it was
 * registered by another account on the same browser it moves to the account now signed in.
 */
export function saveSubscription(uid: UserId, sub: PushSub, userAgent: string | null) {
  // Count ATTEMPTS (in the shared attempt log), not surviving rows: the per-user cap deletes old
  // rows, so counting rows would never reach the limit.
  const key = `push-subscribe:${uid}`, hourAgo = new Date(Date.now() - 3600e3).toISOString();
  const recent = (db().prepare("SELECT COUNT(*) n FROM login_attempts WHERE key = ? AND ts >= ?").get(key, hourAgo) as { n: number }).n;
  if (recent >= MAX_NEW_PER_HOUR) throw new PushError("Too many subscription changes. Try again later.", 429);
  db().prepare("INSERT INTO login_attempts (key, ts) VALUES (?, ?)").run(key, new Date().toISOString());
  db().transaction(() => {
    db().prepare("DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id != ?").run(sub.endpoint, uid);
    db().prepare(`INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, created_at, user_agent) VALUES (?,?,?,?,?,?)
                  ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, failures = 0`)
      .run(uid, sub.endpoint, sub.keys.p256dh, sub.keys.auth, new Date().toISOString(), userAgent?.slice(0, 160) ?? null);
    // Keep at most N per user (oldest dropped).
    db().prepare(`DELETE FROM push_subscriptions WHERE user_id = ? AND id NOT IN (SELECT id FROM push_subscriptions WHERE user_id = ? ORDER BY id DESC LIMIT ?)`).run(uid, uid, MAX_SUBSCRIPTIONS_PER_USER);
  })();
}

/** Remove one of THIS user's subscriptions (never another user's). */
export const removeSubscription = (uid: UserId, endpoint: string) => db().prepare("DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?").run(uid, endpoint).changes > 0;
export const removeAllSubscriptions = (uid: UserId) => db().prepare("DELETE FROM push_subscriptions WHERE user_id = ?").run(uid).changes;

export function subscriptionsFor(uid: UserId) {
  return db().prepare("SELECT id, endpoint, p256dh, auth, failures FROM push_subscriptions WHERE user_id = ?").all(uid) as { id: number; endpoint: string; p256dh: string; auth: string; failures: number }[];
}

/** For export/UI: no endpoint paths or keys, only the push service host. */
export function listSubscriptionsPublic(uid: UserId) {
  return (db().prepare("SELECT endpoint, created_at, last_success_at, failures FROM push_subscriptions WHERE user_id = ?").all(uid) as { endpoint: string; created_at: string; last_success_at: string | null; failures: number }[])
    .map((r) => ({ service: new URL(r.endpoint).hostname, createdAt: r.created_at, lastSuccessAt: r.last_success_at, failures: r.failures }));
}
