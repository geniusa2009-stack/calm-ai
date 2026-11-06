process.env.CALM_DB_PATH = ":memory:";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  acquireWakeLock, notificationState, outcomeMessage, requestNotifications, showNotification, tap, vibrationState, wakeLockState,
  type DeviceEnv, type NotificationLike, type RequestOutcome,
} from "../lib/device/capabilities";
import { pickReminders, REMINDER_TEXT, MAX_PER_DAY } from "../lib/device/reminders";
import { prefersReducedMotion } from "../lib/motion";
import { useDatabase, getSettings } from "../lib/db";
import { register, createSession, SESSION_COOKIE } from "../lib/auth";

const ROOT = path.join(__dirname, "..");

/** A fake Notification constructor whose permission and prompt answer we control. */
function fakeNotification(initial: "default" | "granted" | "denied", answer?: "default" | "granted" | "denied" | "throw") {
  const calls = { request: 0, shown: [] as { title: string; body?: string }[] };
  const N = function (this: unknown, title: string, opts?: { body?: string }) {
    calls.shown.push({ title, body: opts?.body });
    return { close() {}, onclick: null };
  } as unknown as NotificationLike & { permission: string };
  (N as { permission: string }).permission = initial;
  (N as unknown as { requestPermission: () => Promise<string> }).requestPermission = async () => {
    calls.request++;
    if (answer === "throw") throw new Error("boom");
    if (answer && answer !== "default") (N as { permission: string }).permission = answer;
    return answer ?? "default";
  };
  return { env: { Notification: N, isSecureContext: true } as DeviceEnv, calls };
}

// ---------- notifications ----------
test("reading notification state never prompts", () => {
  for (const p of ["default", "granted", "denied"] as const) {
    const { env, calls } = fakeNotification(p, "granted");
    notificationState(env); notificationState(env);
    assert.equal(calls.request, 0, `state=${p}`);
  }
});

test("granted: prompt shown once after explicit request; result reported", async () => {
  const { env, calls } = fakeNotification("default", "granted");
  const r = await requestNotifications(env);
  assert.deepEqual(r, { outcome: "granted", state: "granted" });
  assert.equal(calls.request, 1);
});

test("denied: reported as denied; a later request does NOT prompt again", async () => {
  const { env, calls } = fakeNotification("default", "denied");
  assert.equal((await requestNotifications(env)).outcome, "denied");
  assert.equal((await requestNotifications(env)).outcome, "already-denied");
  assert.equal(calls.request, 1, "must not re-prompt after denial");
});

test("dismissed: closing the prompt is distinguished from denying", async () => {
  const { env, calls } = fakeNotification("default", "default");
  const r = await requestNotifications(env);
  assert.deepEqual(r, { outcome: "dismissed", state: "prompt" });
  assert.equal(calls.request, 1);
});

test("already blocked in the browser: no prompt, explains how to change it", async () => {
  const { env, calls } = fakeNotification("denied", "granted");
  assert.equal((await requestNotifications(env)).outcome, "already-denied");
  assert.equal(calls.request, 0);
  assert.match(outcomeMessage("already-denied").body, /site settings/);
});

test("unsupported and insecure contexts never attempt a prompt", async () => {
  assert.equal(notificationState({}), "unsupported");
  assert.equal((await requestNotifications({})).outcome, "unsupported");
  const { env, calls } = fakeNotification("default", "granted");
  env.isSecureContext = false;
  assert.equal(notificationState(env), "insecure");
  assert.equal((await requestNotifications(env)).outcome, "unsupported");
  assert.equal(calls.request, 0);
});

test("a throwing browser implementation is reported as an error, not a crash", async () => {
  const { env } = fakeNotification("default", "throw");
  assert.equal((await requestNotifications(env)).outcome, "error");
});

test("every outcome has accurate, pressure-free copy", () => {
  const outcomes: RequestOutcome[] = ["granted", "denied", "dismissed", "unsupported", "already-denied", "already-granted", "error"];
  for (const o of outcomes) {
    const m = outcomeMessage(o);
    assert.ok(m.title && m.body, o);
    assert.doesNotMatch(m.body, /you must|required|please enable|don't miss/i, o);
  }
  assert.match(outcomeMessage("denied").body, /won't ask again/);
});

test("notifications are only shown when granted, and reminder text never contains wellbeing details", () => {
  const blocked = fakeNotification("denied");
  assert.equal(showNotification("Calm", "x", blocked.env), false);
  assert.equal(blocked.calls.shown.length, 0);
  const ok = fakeNotification("granted");
  assert.equal(showNotification(REMINDER_TEXT.radar.title, REMINDER_TEXT.radar.body, ok.env), true);
  for (const t of Object.values(REMINDER_TEXT)) {
    assert.doesNotMatch(t.body, /\d|stress|mood|sleep|strain|anxi|depress|score/i, t.body);
  }
});

// ---------- reminder policy ----------
test("reminders: none while Calm is visible; capped per day; never repeated", () => {
  const n = [{ id: "checkin", kind: "checkin" as const }, { id: "radar:a", kind: "radar" as const }, { id: "pos:b", kind: "positive" as const }];
  assert.deepEqual(pickReminders(n, [], false), []);
  assert.equal(pickReminders(n, [], true).length, MAX_PER_DAY);
  assert.deepEqual(pickReminders(n, ["checkin"], true).map((x) => x.id), ["radar:a"]);
  assert.deepEqual(pickReminders(n, ["checkin", "radar:a"], true), []);
});

// ---------- wake lock & vibration ----------
test("wake lock: unsupported, acquired, and refused by the browser", async () => {
  assert.equal(wakeLockState({}), "unsupported");
  assert.deepEqual(await acquireWakeLock({}), { ok: false, reason: "unsupported" });
  let released = false;
  const okEnv: DeviceEnv = { isSecureContext: true, navigator: { wakeLock: { request: async () => ({ release: async () => { released = true; } }) } } };
  const r = await acquireWakeLock(okEnv);
  assert.ok(r.ok);
  if (r.ok) await r.sentinel.release();
  assert.ok(released);
  const refuse: DeviceEnv = { isSecureContext: true, navigator: { wakeLock: { request: async () => { const e = new Error("low battery"); e.name = "NotAllowedError"; throw e; } } } };
  assert.deepEqual(await acquireWakeLock(refuse), { ok: false, reason: "NotAllowedError" });
});

test("vibration: silently unavailable on devices without it (e.g. iOS Safari)", () => {
  assert.equal(vibrationState({ navigator: {} }), "unsupported");
  assert.equal(tap({ navigator: {} }), false);
  const seen: unknown[] = [];
  assert.equal(tap({ navigator: { vibrate: (p) => { seen.push(p); return true; } } }, 20), true);
  assert.deepEqual(seen, [20]);
});

// ---------- reduced motion ----------
test("reduced motion: detected from matchMedia; safe when unavailable", () => {
  assert.equal(prefersReducedMotion((q) => ({ matches: q.includes("reduce") })), true);
  assert.equal(prefersReducedMotion(() => ({ matches: false })), false);
  assert.equal(prefersReducedMotion(undefined), false);
  assert.equal(prefersReducedMotion(() => { throw new Error("no"); }), false);
});

test("reduced motion: stylesheet collapses durations and swaps movement for a fade", () => {
  const css = fs.readFileSync(path.join(ROOT, "app/globals.css"), "utf8");
  const blocks = [...css.matchAll(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/g)].map((m) => m[1]).join("\n");
  assert.match(blocks, /--dur: 1ms/);
  assert.match(blocks, /--rise: 0px/);
  assert.match(blocks, /animation-name: fade-in/);
  assert.match(blocks, /animation-delay: 0ms !important/, "staggered content must not stay hidden under reduced motion");
  assert.match(blocks, /\.skeleton::after \{ animation: none; \}/);
});

// ---------- static guarantees ----------
function sourceFiles() {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
    }
  };
  ["app", "components", "lib"].forEach((d) => walk(path.join(ROOT, d)));
  return out;
}

test("only the capability module can trigger a permission prompt", () => {
  for (const f of sourceFiles()) {
    const src = fs.readFileSync(f, "utf8");
    if (f.endsWith(path.join("lib", "device", "capabilities.ts"))) continue;
    assert.doesNotMatch(src, /\.requestPermission\s*\(/, `${path.relative(ROOT, f)} calls requestPermission`);
  }
  // requestNotifications() is only invoked from click handlers in the two UI files that offer it.
  const callers = sourceFiles().filter((f) => /requestNotifications\(\)/.test(fs.readFileSync(f, "utf8"))).map((f) => path.relative(ROOT, f)).sort();
  assert.deepEqual(callers, ["app/settings/DevicePermissions.tsx", "app/setup/devices/DeviceSetup.tsx"]);
});

test("Calm never touches location, microphone, camera or motion sensors", () => {
  for (const f of sourceFiles()) {
    const src = fs.readFileSync(f, "utf8");
    assert.doesNotMatch(src, /navigator\.geolocation|getUserMedia|DeviceMotionEvent|DeviceOrientationEvent|getCurrentPosition|watchPosition/, path.relative(ROOT, f));
  }
});

// ---------- settings & nudges API ----------
const req = (m: string, url: string, token: string, body?: unknown) => new Request("http://calm.test" + url, {
  method: m, body: body === undefined ? undefined : JSON.stringify(body),
  headers: { host: "calm.test", origin: "http://calm.test", "content-type": "application/json", cookie: `${SESSION_COOKIE}=${token}` },
});

beforeEach(() => { useDatabase(); });

test("settings: device preferences validate, persist per user, and default to off/pending", async () => {
  const a = await register("dev-a@example.com", "correct horse battery");
  const b = await register("dev-b@example.com", "correct horse battery");
  const ta = createSession(a.id).token;
  const { POST } = await import(path.join(ROOT, "app/api/settings/route.ts"));
  const d = getSettings(a.id);
  assert.deepEqual([d.notifyEnabled, d.wakeLockEnabled, d.hapticsEnabled, d.deviceSetup, d.deviceStep], [false, false, false, "pending", 0]);
  assert.equal((await POST(req("POST", "/api/settings", ta, { deviceSetup: "bogus" }))).status, 400);
  assert.equal((await POST(req("POST", "/api/settings", ta, { deviceStep: 99 }))).status, 400);
  assert.equal((await POST(req("POST", "/api/settings", ta, { notifyEnabled: true, wakeLockEnabled: true, deviceSetup: "in-progress", deviceStep: 2 }))).status, 200);
  const after = getSettings(a.id);
  assert.deepEqual([after.notifyEnabled, after.wakeLockEnabled, after.deviceSetup, after.deviceStep], [true, true, "in-progress", 2]);
  assert.equal(getSettings(b.id).notifyEnabled, false, "isolated per user");
});

test("nudges API: empty unless opted in; exposes only ids and coarse kinds", async () => {
  const u = await register("nudge@example.com", "correct horse battery");
  const t = createSession(u.id).token;
  const { GET } = await import(path.join(ROOT, "app/api/nudges/route.ts"));
  const { POST: settings } = await import(path.join(ROOT, "app/api/settings/route.ts"));
  assert.deepEqual(await (await GET(req("GET", "/api/nudges", t))).json(), { nudges: [] });
  await settings(req("POST", "/api/settings", t, { notifyEnabled: true, onboarded: true, quietStart: 0, quietEnd: 0 }));
  const body = await (await GET(req("GET", "/api/nudges", t))).json();
  for (const n of body.nudges) assert.deepEqual(Object.keys(n).sort(), ["id", "kind"]);
});
