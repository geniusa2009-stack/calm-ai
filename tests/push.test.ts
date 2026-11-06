/**
 * Web Push: subscription validation/storage/isolation, delivery bookkeeping, VAPID + payload
 * encryption, timezone-aware scheduling, duplicate prevention, deletion.
 * Delivery here is SIMULATED (a fake sender, or web-push's request builder) — not a real
 * push service and not a real device. See docs/push-notifications.md.
 */
process.env.CALM_DB_PATH = ":memory:";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import path from "node:path";
import webpush from "web-push";
import { useDatabase, db, saveSettings, addCheckIn } from "../lib/db";
import { register, createSession, deleteAccount, SESSION_COOKIE } from "../lib/auth";
import { validateSubscription, saveSubscription, subscriptionsFor, removeSubscription, listSubscriptionsPublic, PushError, MAX_SUBSCRIPTIONS_PER_USER } from "../lib/push/store";
import { sendToUser, MAX_FAILURES, type Sender } from "../lib/push/send";
import { dueReminders } from "../lib/push/schedule";
import { runSweep } from "../lib/push/sweep";
import { zonedTimeToUtc } from "../lib/time";

const ROOT = path.join(__dirname, "..");
const vapid = webpush.generateVAPIDKeys(); // generated per test run, never stored

function fakeSubscription(host = "fcm.googleapis.com") {
  const ecdh = crypto.createECDH("prime256v1"); ecdh.generateKeys();
  return { endpoint: `https://${host}/fcm/send/${crypto.randomBytes(12).toString("hex")}`, keys: { p256dh: ecdh.getPublicKey().toString("base64url"), auth: crypto.randomBytes(16).toString("base64url") } };
}
const okSender = (log: string[] = []): Sender => async (sub) => { log.push(sub.endpoint); return { statusCode: 201 }; };
const failSender = (code: number): Sender => async () => { throw Object.assign(new Error("push failed"), { statusCode: code }); };
const req = (m: string, url: string, token: string, body?: unknown, origin = "http://calm.test") => new Request("http://calm.test" + url, {
  method: m, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  headers: { host: "calm.test", origin, "content-type": "application/json", cookie: `${SESSION_COOKIE}=${token}` },
});

beforeEach(() => {
  useDatabase();
  process.env.CALM_VAPID_PUBLIC_KEY = vapid.publicKey; process.env.CALM_VAPID_PRIVATE_KEY = vapid.privateKey; process.env.CALM_VAPID_SUBJECT = "mailto:test@example.invalid";
});

// ---------- validation ----------
test("subscription validation: https push services with real-sized keys only", () => {
  assert.ok(validateSubscription(fakeSubscription()));
  const good = fakeSubscription();
  const bad: unknown[] = [
    null, {}, { ...good, endpoint: "http://fcm.googleapis.com/x" }, { ...good, endpoint: "javascript:alert(1)" },
    { ...good, endpoint: "https://user:pw@push.example.com/x" }, { ...good, endpoint: "https://localhost/x" },
    { ...good, endpoint: "https://x.com/" + "a".repeat(3000) },
    { ...good, keys: { ...good.keys, p256dh: "short" } }, { ...good, keys: { ...good.keys, auth: "not base64 !!" } }, { endpoint: good.endpoint },
  ];
  for (const b of bad) assert.throws(() => validateSubscription(b), PushError, JSON.stringify(b)?.slice(0, 60));
});

// ---------- API + isolation ----------
test("subscribe API: auth + CSRF + validation; 503 when push isn't configured", async () => {
  const u = await register("s@example.com", "correct horse battery");
  const t = createSession(u.id).token;
  const { POST } = await import(path.join(ROOT, "app/api/push/subscribe/route.ts"));
  assert.equal((await POST(req("POST", "/api/push/subscribe", t, { subscription: fakeSubscription() }, "https://evil.example"))).status, 403);
  assert.equal((await POST(req("POST", "/api/push/subscribe", t, { subscription: { endpoint: "http://x" } }))).status, 400);
  assert.equal((await POST(req("POST", "/api/push/subscribe", t, "x".repeat(5000)))).status, 413);
  assert.equal((await POST(req("POST", "/api/push/subscribe", t, { subscription: fakeSubscription() }))).status, 200);
  assert.equal(subscriptionsFor(u.id).length, 1);
  delete process.env.CALM_VAPID_PRIVATE_KEY;
  assert.equal((await POST(req("POST", "/api/push/subscribe", t, { subscription: fakeSubscription() }))).status, 503);
});

test("isolation: users can't remove or read each other's subscriptions; a shared browser moves to the signed-in user", async () => {
  const a = await register("pa@example.com", "correct horse battery");
  const b = await register("pb@example.com", "correct horse battery");
  const sub = validateSubscription(fakeSubscription());
  saveSubscription(a.id, sub, null);
  assert.equal(removeSubscription(b.id, sub.endpoint), false);
  const { DELETE } = await import(path.join(ROOT, "app/api/push/subscribe/route.ts"));
  const r = await (await DELETE(req("DELETE", "/api/push/subscribe", createSession(b.id).token, { endpoint: sub.endpoint }))).json();
  assert.equal(r.removed, false);
  assert.equal(subscriptionsFor(a.id).length, 1, "A's subscription survives B's attempt");
  saveSubscription(b.id, sub, null); // same browser profile, now B signed in
  assert.equal(subscriptionsFor(a.id).length, 0);
  assert.equal(subscriptionsFor(b.id).length, 1);
  assert.deepEqual(Object.keys(listSubscriptionsPublic(b.id)[0]).sort(), ["createdAt", "failures", "lastSuccessAt", "service"], "no endpoint path or keys exposed");
});

test("limits: at most 10 subscriptions per user; at most 20 changes per hour", async () => {
  const u = await register("lim@example.com", "correct horse battery");
  for (let i = 0; i < 12; i++) saveSubscription(u.id, validateSubscription(fakeSubscription()), null);
  assert.equal(subscriptionsFor(u.id).length, MAX_SUBSCRIPTIONS_PER_USER);
  for (let i = 0; i < 8; i++) saveSubscription(u.id, validateSubscription(fakeSubscription()), null);
  assert.throws(() => saveSubscription(u.id, validateSubscription(fakeSubscription()), null), (e: PushError) => e.status === 429);
});

// ---------- delivery ----------
test("delivery: success recorded; 404/410 remove the subscription; repeated failures remove it; others kept", async () => {
  const u = await register("d@example.com", "correct horse battery");
  const s1 = validateSubscription(fakeSubscription()), s2 = validateSubscription(fakeSubscription());
  saveSubscription(u.id, s1, null); saveSubscription(u.id, s2, null);
  const log: string[] = [];
  assert.deepEqual(await sendToUser(u.id, { title: "Calm", body: "x", tag: "t" }, okSender(log)), { sent: 2, removed: 0, failed: 0 });
  assert.equal(log.length, 2);
  assert.ok((db().prepare("SELECT last_success_at FROM push_subscriptions LIMIT 1").get() as { last_success_at: string }).last_success_at);
  assert.deepEqual(await sendToUser(u.id, { title: "Calm", body: "x", tag: "t" }, failSender(410)), { sent: 0, removed: 2, failed: 0 });
  saveSubscription(u.id, validateSubscription(fakeSubscription()), null);
  for (let i = 1; i < MAX_FAILURES; i++) assert.equal((await sendToUser(u.id, { title: "C", body: "x", tag: "t" }, failSender(503))).failed, 1);
  assert.equal((await sendToUser(u.id, { title: "C", body: "x", tag: "t" }, failSender(503))).removed, 1);
  assert.equal(subscriptionsFor(u.id).length, 0);
});

test("payload is encrypted (aes128gcm) and VAPID-signed; plaintext never on the wire", () => {
  const sub = fakeSubscription();
  const payload = JSON.stringify({ title: "Calm", body: "A quick check-in, whenever you have a moment.", tag: "calm-checkin" });
  const d = webpush.generateRequestDetails(sub, payload, { vapidDetails: { subject: "mailto:t@example.invalid", publicKey: vapid.publicKey, privateKey: vapid.privateKey }, TTL: 43200, urgency: "low" });
  assert.equal(d.method, "POST");
  assert.equal(d.endpoint, sub.endpoint);
  assert.equal(d.headers["Content-Encoding"], "aes128gcm");
  assert.equal(String(d.headers.TTL), "43200");
  assert.equal(d.headers.Urgency, "low");
  assert.match(String(d.headers.Authorization), /^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=/);
  assert.ok(!Buffer.from(d.body as Buffer).toString("latin1").includes("check-in"), "body is ciphertext");
});

test("no delivery at all when push isn't configured (no keys → nothing sent)", async () => {
  delete process.env.CALM_VAPID_PUBLIC_KEY; delete process.env.CALM_VAPID_PRIVATE_KEY;
  const u = await register("nc@example.com", "correct horse battery");
  saveSubscription(u.id, validateSubscription(fakeSubscription()), null);
  const log: string[] = [];
  assert.deepEqual(await sendToUser(u.id, { title: "C", body: "x", tag: "t" }, okSender(log)), { sent: 0, removed: 0, failed: 0 });
  assert.equal(log.length, 0);
  assert.equal((await runSweep(new Date(), okSender())).configured, false);
});

// ---------- scheduling (pure) ----------
const base = { timezone: "Africa/Cairo", quietStart: 22, quietEnd: 8, notifyEnabled: true, pushCheckin: true, pushRadar: true, reminderHour: 19 };
const at = (date: string, h: number, tz = "Africa/Cairo") => zonedTimeToUtc(date, h, 0, tz);

test("schedule: local reminder hour, quiet hours and daily cap in the person's zone", () => {
  const due = (h: number, extra: object = {}) => dueReminders({ settings: base, now: at("2026-11-05", h), checkedInToday: false, radarNotice: false, sentToday: [], ...extra }).due.map((d) => d.kind);
  assert.deepEqual(due(18), [], "before the chosen hour");
  assert.deepEqual(due(19), ["checkin"]);
  assert.deepEqual(due(23), [], "quiet hours (22–08 local)");
  assert.deepEqual(due(7), [], "still quiet");
  assert.deepEqual(due(20, { checkedInToday: true }), [], "already checked in");
  assert.deepEqual(due(20, { radarNotice: true }), ["checkin", "radar"]);
  assert.deepEqual(due(20, { radarNotice: true, sentToday: ["checkin"] }), ["radar"], "each kind once per local day");
  assert.deepEqual(due(20, { radarNotice: true, sentToday: ["checkin", "test"] }), [], "daily cap of 2");
  assert.deepEqual(dueReminders({ settings: { ...base, notifyEnabled: false }, now: at("2026-11-05", 20), checkedInToday: false, radarNotice: true, sentToday: [] }).due, []);
  assert.deepEqual(dueReminders({ settings: { ...base, pushCheckin: false }, now: at("2026-11-05", 20), checkedInToday: false, radarNotice: false, sentToday: [] }).due, [], "category off");
});

test("schedule: the same instant behaves differently after a timezone change; local date used for dedupe", () => {
  const now = at("2026-11-05", 20); // 20:00 Cairo = 13:00 New York
  const cairo = dueReminders({ settings: base, now, checkedInToday: false, radarNotice: false, sentToday: [] });
  const ny = dueReminders({ settings: { ...base, timezone: "America/New_York" }, now, checkedInToday: false, radarNotice: false, sentToday: [] });
  assert.deepEqual(cairo.due.map((d) => d.kind), ["checkin"]);
  assert.deepEqual(ny.due.map((d) => d.kind), []);
  const lateUtc = new Date("2026-11-05T23:30:00Z"); // 01:30 on 6 Nov in Cairo, 18:30 on 5 Nov in New York
  assert.equal(dueReminders({ settings: base, now: lateUtc, checkedInToday: false, radarNotice: false, sentToday: [] }).localDate, "2026-11-06");
  assert.equal(dueReminders({ settings: { ...base, timezone: "America/New_York" }, now: lateUtc, checkedInToday: false, radarNotice: false, sentToday: [] }).localDate, "2026-11-05");
});

test("schedule: payloads are generic — no measurements, states, notes or names", () => {
  const { due } = dueReminders({ settings: base, now: at("2026-11-05", 20), checkedInToday: false, radarNotice: true, sentToday: [] });
  for (const d of due) {
    assert.doesNotMatch(d.payload.body + d.payload.title, /\d|stress|mood|sleep|strain|anx|depress|score|@/i);
    assert.ok(d.payload.body.length < 120);
  }
});

// ---------- sweep (scheduler + delivery + dedupe) ----------
test("sweep: sends once per kind per local day, even across repeated runs; new local day sends again", async () => {
  const u = await register("sw@example.com", "correct horse battery");
  saveSettings(u.id, { ...base, onboarded: true });
  saveSubscription(u.id, validateSubscription(fakeSubscription()), null);
  const log: string[] = [];
  const r1 = await runSweep(at("2026-11-05", 20), okSender(log));
  assert.equal(r1.sent, 1);
  const r2 = await runSweep(at("2026-11-05", 21), okSender(log));
  assert.equal(r2.sent, 0, "duplicate prevented");
  assert.equal(log.length, 1);
  const r3 = await runSweep(at("2026-11-06", 20), okSender(log));
  assert.equal(r3.sent, 1, "next local day");
  const quiet = await runSweep(at("2026-11-07", 23), okSender(log));
  assert.equal(quiet.sent, 0, "quiet hours");
});

test("sweep: skips people who turned reminders off or already checked in", async () => {
  const u = await register("off@example.com", "correct horse battery");
  saveSettings(u.id, { ...base, onboarded: true, notifyEnabled: false });
  saveSubscription(u.id, validateSubscription(fakeSubscription()), null);
  assert.equal((await runSweep(at("2026-11-05", 20), okSender())).users, 0);
  const v = await register("done@example.com", "correct horse battery");
  saveSettings(v.id, { ...base, onboarded: true });
  saveSubscription(v.id, validateSubscription(fakeSubscription()), null);
  const now = at("2026-11-05", 20);
  addCheckIn(v.id, { ts: new Date(now.getTime() - 3600e3).toISOString(), tz: "Africa/Cairo", mood: 6, energy: 6, stress: 4, focus: null, sleepHours: null, sleepQuality: null, tags: [], note: null, mode: "everyday" });
  assert.equal((await runSweep(now, okSender())).sent, 0);
});

test("account deletion removes subscriptions and delivery history", async () => {
  const u = await register("gone@example.com", "correct horse battery");
  saveSubscription(u.id, validateSubscription(fakeSubscription()), null);
  db().prepare("INSERT INTO push_deliveries (user_id, kind, local_date, sent_at, outcome) VALUES (?, 'checkin', '2026-11-05', 'x', 'sent')").run(u.id);
  await deleteAccount(u.id, "correct horse battery");
  assert.equal((db().prepare("SELECT COUNT(*) n FROM push_subscriptions").get() as { n: number }).n, 0);
  assert.equal((db().prepare("SELECT COUNT(*) n FROM push_deliveries").get() as { n: number }).n, 0);
});

test("test-push endpoint: own devices only, rate limited to one a minute", async () => {
  const u = await register("tp@example.com", "correct horse battery");
  const t = createSession(u.id).token;
  const { POST } = await import(path.join(ROOT, "app/api/push/test/route.ts"));
  const first = await POST(req("POST", "/api/push/test", t, {}));
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { sent: 0, removed: 0, failed: 0 }, "no subscriptions → nothing sent");
  assert.equal((await POST(req("POST", "/api/push/test", t, {}))).status, 429);
});
