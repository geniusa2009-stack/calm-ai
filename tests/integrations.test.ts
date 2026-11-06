/**
 * OAuth integration framework + Oura adapter, against an in-process MOCK provider.
 * These tests prove our side of the protocol; they do not prove Oura's real API matches
 * (see docs/wearable-integrations.md: "Implemented but not externally verified").
 */
process.env.CALM_DB_PATH = ":memory:";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import path from "node:path";
import { useDatabase, db, exportAll } from "../lib/db";
import { register, createSession, SESSION_COOKIE } from "../lib/auth";
import { availability, beginAuthorization, completeAuthorization, accessToken, syncProvider, disconnect, connectionInfo, pkceChallenge, IntegrationError } from "../lib/integrations/oauth";
import { oura, normaliseOuraSleep } from "../lib/integrations/oura";
import { listReadings } from "../lib/signals/store";
import { decryptSecret, encryptSecret } from "../lib/secrets";

const ROOT = path.join(__dirname, "..");
const KEY = crypto.randomBytes(32).toString("base64");
function configure(on = true) {
  if (on) { process.env.CALM_TOKEN_KEY = KEY; process.env.OURA_CLIENT_ID = "test-client"; process.env.OURA_CLIENT_SECRET = "test-secret"; }
  else { delete process.env.CALM_TOKEN_KEY; delete process.env.OURA_CLIENT_ID; delete process.env.OURA_CLIENT_SECRET; }
}

/** Mock provider. Records every request; behaviour is scripted per test. */
function mockProvider(opts: { pages?: unknown[][]; script?: (url: string, n: number) => Response | null } = {}) {
  const calls: { url: string; body: URLSearchParams | null; auth: string | null }[] = [];
  let access = 0, apiHits = 0;
  const f: typeof fetch = async (input, init) => {
    const url = String(input);
    const body = init?.body instanceof URLSearchParams ? init.body : init?.body ? new URLSearchParams(String(init.body)) : null;
    const auth = new Headers(init?.headers).get("authorization");
    calls.push({ url, body, auth });
    const scripted = opts.script?.(url, calls.length);
    if (scripted) return scripted;
    if (url === oura.tokenUrl) {
      access++;
      return Response.json({ access_token: `at-${access}`, refresh_token: `rt-${access}`, expires_in: 3600, scope: "daily", token_type: "bearer" });
    }
    if (url === oura.revokeUrl) return new Response(null, { status: 200 });
    if (url.startsWith("https://api.ouraring.com/v2/usercollection/sleep")) {
      const pages = opts.pages ?? [[]];
      const i = apiHits++;
      return Response.json({ data: pages[i] ?? [], next_token: i + 1 < pages.length ? `page-${i + 1}` : null });
    }
    return new Response("not found", { status: 404 });
  };
  return { f, calls };
}

const sleepRow = (id: string, day: string, extra: object = {}) => ({
  id, type: "long_sleep", bedtime_start: `${day}T23:00:00+02:00`, bedtime_end: `${day.slice(0, 8)}${String(Number(day.slice(8)) + 1).padStart(2, "0")}T07:00:00+02:00`,
  total_sleep_duration: 8 * 3600 - 300, lowest_heart_rate: 52, average_hrv: 41, ...extra,
});
const NOW = Date.parse("2026-11-06T12:00:00Z");

async function connected(email = "o@example.com", pages?: unknown[][]) {
  const u = await register(email, "correct horse battery");
  const m = mockProvider({ pages });
  const { url, state } = beginAuthorization(u.id, oura, "https://calm.test/api/integrations/oura/callback", NOW);
  await completeAuthorization(u.id, oura, state, "the-code", m.f, NOW);
  return { u, m, url, state };
}

beforeEach(() => { useDatabase(); configure(true); });

// ---------- configuration ----------
test("availability: blocked without credentials or without the token encryption key", () => {
  configure(false);
  assert.equal(availability(oura), "token_key_missing");
  process.env.CALM_TOKEN_KEY = KEY;
  assert.equal(availability(oura), "blocked_by_credentials");
  configure(true);
  assert.equal(availability(oura), "available");
});

test("secrets: AES-256-GCM round trip; tampering and wrong keys are rejected", () => {
  const blob = encryptSecret("hello");
  assert.notEqual(blob, encryptSecret("hello"), "random IV per value");
  assert.equal(decryptSecret(blob), "hello");
  const parts = blob.split("."); parts[3] = Buffer.from("x").toString("base64url");
  assert.throws(() => decryptSecret(parts.join(".")));
  assert.throws(() => decryptSecret(blob, crypto.randomBytes(32)));
});

// ---------- authorization ----------
test("authorize URL: minimal scope, exact redirect, state, PKCE S256; state stored only as a hash", async () => {
  const u = await register("a@example.com", "correct horse battery");
  const { url, state } = beginAuthorization(u.id, oura, "https://calm.test/api/integrations/oura/callback", NOW);
  const q = new URL(url).searchParams;
  assert.equal(new URL(url).origin + new URL(url).pathname, oura.authorizeUrl);
  assert.equal(q.get("response_type"), "code");
  assert.equal(q.get("client_id"), "test-client");
  assert.equal(q.get("scope"), "daily");
  assert.equal(q.get("redirect_uri"), "https://calm.test/api/integrations/oura/callback");
  assert.equal(q.get("state"), state);
  assert.equal(q.get("code_challenge_method"), "S256");
  assert.ok(!url.includes("test-secret"), "client secret never in the browser URL");
  const dump = JSON.stringify(db().prepare("SELECT * FROM oauth_states").all());
  assert.ok(!dump.includes(state), "raw state not stored");
  const row = db().prepare("SELECT verifier_enc FROM oauth_states").get() as { verifier_enc: string };
  assert.equal(pkceChallenge(decryptSecret(row.verifier_enc)), q.get("code_challenge"));
});

test("callback: exchanges the code with the matching PKCE verifier and stores tokens encrypted", async () => {
  const { u, m, url } = await connected();
  const tokenCall = m.calls.find((c) => c.url === oura.tokenUrl)!;
  assert.equal(tokenCall.body!.get("grant_type"), "authorization_code");
  assert.equal(tokenCall.body!.get("code"), "the-code");
  assert.equal(pkceChallenge(tokenCall.body!.get("code_verifier")!), new URL(url).searchParams.get("code_challenge"));
  assert.equal(tokenCall.body!.get("redirect_uri"), "https://calm.test/api/integrations/oura/callback");
  const dump = JSON.stringify(db().prepare("SELECT * FROM provider_connections").all());
  assert.ok(!dump.includes("at-1") && !dump.includes("rt-1"), "tokens are not stored in plaintext");
  assert.equal(await accessToken(u.id, oura, m.f, NOW), "at-1");
  assert.equal(connectionInfo(u.id)[0].status, "connected");
  assert.ok(!JSON.stringify(connectionInfo(u.id)).includes("at-1"));
});

test("state is single-use, bound to the user and provider, and expires", async () => {
  const a = await register("sa@example.com", "correct horse battery");
  const b = await register("sb@example.com", "correct horse battery");
  const m = mockProvider();
  const s1 = beginAuthorization(a.id, oura, "https://calm.test/cb", NOW).state;
  await assert.rejects(completeAuthorization(b.id, oura, s1, "c", m.f, NOW), (e: IntegrationError) => e.code === "bad_state");
  await assert.rejects(completeAuthorization(a.id, oura, s1, "c", m.f, NOW), (e: IntegrationError) => e.code === "bad_state", "consumed by the failed attempt");
  const s2 = beginAuthorization(a.id, oura, "https://calm.test/cb", NOW).state;
  await completeAuthorization(a.id, oura, s2, "c", m.f, NOW);
  await assert.rejects(completeAuthorization(a.id, oura, s2, "c", m.f, NOW), (e: IntegrationError) => e.code === "bad_state", "replay rejected");
  const s3 = beginAuthorization(a.id, oura, "https://calm.test/cb", NOW).state;
  await assert.rejects(completeAuthorization(a.id, oura, s3, "c", m.f, NOW + 11 * 60e3), (e: IntegrationError) => e.code === "expired_state");
  await assert.rejects(completeAuthorization(a.id, oura, undefined, "c", m.f, NOW), (e: IntegrationError) => e.code === "bad_callback");
  assert.equal(connectionInfo(b.id).length, 0, "user B gained nothing");
});

// ---------- token lifecycle ----------
test("refresh: expiring tokens are refreshed; rotated refresh tokens replace old ones; un-rotated ones are kept", async () => {
  const { u, m } = await connected();
  assert.equal(await accessToken(u.id, oura, m.f, NOW + 3600e3), "at-2"); // expired → refresh
  const refreshCall = m.calls.filter((c) => c.url === oura.tokenUrl)[1];
  assert.equal(refreshCall.body!.get("grant_type"), "refresh_token");
  assert.equal(refreshCall.body!.get("refresh_token"), "rt-1");
  const noRotate = mockProvider({ script: (url) => (url === oura.tokenUrl ? Response.json({ access_token: "at-x", expires_in: 3600 }) : null) });
  await accessToken(u.id, oura, noRotate.f, NOW + 7200e3 + 60e3);
  const row = db().prepare("SELECT refresh_token_enc FROM provider_connections").get() as { refresh_token_enc: string };
  assert.equal(decryptSecret(row.refresh_token_enc), "rt-2", "old refresh token kept when provider doesn't rotate");
});

test("refresh rejected → reconnect required (no silent failure)", async () => {
  const { u } = await connected();
  const bad = mockProvider({ script: (url) => (url === oura.tokenUrl ? new Response("{}", { status: 400 }) : null) });
  await assert.rejects(accessToken(u.id, oura, bad.f, NOW + 3600e3), (e: IntegrationError) => e.code === "reauth_required");
  assert.equal(connectionInfo(u.id)[0].status, "reauth_required");
});

// ---------- sync ----------
test("sync: paginates, normalises, preserves provenance, and is idempotent", async () => {
  const pages = [[sleepRow("s1", "2026-11-01"), sleepRow("s2", "2026-11-02")], [sleepRow("s3", "2026-11-03"), { id: "bad" }]];
  const { u, m } = await connected("p@example.com", pages);
  const r = await syncProvider(u.id, oura, { f: m.f, now: NOW, backoffMs: 1 });
  assert.equal(r.pages, 2);
  assert.equal(r.providerRejected, 1, "malformed provider row counted, not guessed");
  assert.equal(r.inserted, 9); // 3 nights × (sleep, resting HR, HRV)
  const readings = listReadings(u.id, 100000);
  assert.ok(readings.every((x) => x.provider === "oura"), "provenance kept");
  assert.ok(m.calls.filter((c) => c.url.includes("/v2/")).every((c) => c.auth === "Bearer at-1"));
  assert.ok(m.calls.some((c) => c.url.includes("next_token=page-1")));
  const again = await syncProvider(u.id, oura, { f: mockProvider({ pages }).f, now: NOW + 60e3, backoffMs: 1 });
  assert.equal(again.inserted, 0); assert.equal(again.duplicates, 9);
});

test("sync: 429 with Retry-After is retried; 401 triggers one refresh; persistent 401 → reconnect; 5xx → error", async () => {
  const { u } = await connected("r@example.com");
  let n = 0;
  const flaky = mockProvider({ pages: [[sleepRow("s1", "2026-11-01")]], script: (url) => (url.includes("/v2/") && n++ === 0 ? new Response("", { status: 429, headers: { "retry-after": "0" } }) : null) });
  assert.equal((await syncProvider(u.id, oura, { f: flaky.f, now: NOW, backoffMs: 1 })).inserted, 3);

  let k = 0;
  const expired = mockProvider({ script: (url) => (url.includes("/v2/") && k++ === 0 ? new Response("", { status: 401 }) : null) });
  await syncProvider(u.id, oura, { f: expired.f, now: NOW + 1, backoffMs: 1 });
  assert.ok(expired.calls.some((c) => c.url === oura.tokenUrl), "refreshed after 401");

  const dead = mockProvider({ script: (url) => (url.includes("/v2/") ? new Response("", { status: 401 }) : null) });
  await assert.rejects(syncProvider(u.id, oura, { f: dead.f, now: NOW + 2, backoffMs: 1 }), (e: IntegrationError) => e.code === "reauth_required");
  assert.equal(connectionInfo(u.id)[0].status, "reauth_required");

  const { u: u2 } = await connected("r2@example.com");
  const down = mockProvider({ script: (url) => (url.includes("/v2/") ? new Response("", { status: 503 }) : null) });
  await assert.rejects(syncProvider(u2.id, oura, { f: down.f, now: NOW, backoffMs: 1 }), (e: IntegrationError) => e.code === "sync_failed");
  assert.equal(down.calls.filter((c) => c.url.includes("/v2/")).length, 4, "1 try + 3 retries");
  assert.match(connectionInfo(u2.id)[0].last_error!, /^http_503$/, "error stored as a code, not a payload");
});

// ---------- disconnect, deletion, isolation ----------
test("disconnect: revokes at the provider, deletes tokens; optional data deletion; other users untouched", async () => {
  const { u: a } = await connected("da@example.com", [[sleepRow("s1", "2026-11-01")]]);
  const { u: b } = await connected("db@example.com", [[sleepRow("s1", "2026-11-01")]]);
  const mk = mockProvider({ pages: [[sleepRow("s1", "2026-11-01")]] });
  await syncProvider(a.id, oura, { f: mk.f, now: NOW, backoffMs: 1 });
  await syncProvider(b.id, oura, { f: mockProvider({ pages: [[sleepRow("s1", "2026-11-01")]] }).f, now: NOW, backoffMs: 1 });
  const rv = mockProvider();
  const { revoked } = await disconnect(a.id, oura, { f: rv.f, deleteData: true });
  assert.ok(revoked);
  assert.equal(rv.calls[0].url, oura.revokeUrl);
  assert.equal(rv.calls[0].body!.get("token"), "rt-1");
  assert.equal(connectionInfo(a.id).length, 0);
  assert.equal(listReadings(a.id, 100000).length, 0);
  assert.equal(connectionInfo(b.id).length, 1, "B still connected");
  assert.equal(listReadings(b.id, 100000).length, 3, "B's data untouched");
});

test("account deletion revokes provider grants — only after the password is confirmed", async () => {
  const { u } = await connected("del@example.com");
  const t = createSession(u.id).token;
  const seen: string[] = [];
  const orig = globalThis.fetch;
  globalThis.fetch = (async (i: RequestInfo | URL) => { seen.push(String(i)); return new Response(null, { status: 200 }); }) as typeof fetch;
  try {
    const { DELETE } = await import(path.join(ROOT, "app/api/account/route.ts"));
    const call = (pw: string) => DELETE(new Request("http://calm.test/api/account", { method: "DELETE", body: JSON.stringify({ password: pw }), headers: { host: "calm.test", origin: "http://calm.test", "content-type": "application/json", cookie: `${SESSION_COOKIE}=${t}` } }));
    assert.equal((await call("wrong")).status, 401);
    assert.deepEqual(seen, [], "nothing revoked on a wrong password");
    assert.equal((await call("correct horse battery")).status, 200);
    assert.deepEqual(seen, [oura.revokeUrl]);
    assert.equal((db().prepare("SELECT COUNT(*) n FROM provider_connections").get() as { n: number }).n, 0);
  } finally { globalThis.fetch = orig; }
});

test("export lists the connection but never any token or verifier", async () => {
  const { u } = await connected("ex@example.com");
  const { GET } = await import(path.join(ROOT, "app/api/export/route.ts"));
  const t = createSession(u.id).token;
  const text = await (await GET(new Request("http://calm.test/api/export", { headers: { host: "calm.test", cookie: `${SESSION_COOKIE}=${t}` } }))).text();
  assert.match(text, /"provider": "oura"/);
  for (const bad of ["at-1", "rt-1", "token_enc", "verifier", "test-secret"]) assert.ok(!text.includes(bad), bad);
  assert.ok(exportAll(u.id));
});

test("callback route: another user's state is refused and reported by code only", async () => {
  const a = await register("cba@example.com", "correct horse battery");
  const b = await register("cbb@example.com", "correct horse battery");
  const { state } = beginAuthorization(a.id, oura, "https://calm.test/cb", Date.now());
  const { GET } = await import(path.join(ROOT, "app/api/integrations/[provider]/callback/route.ts"));
  const res = await GET(new Request(`http://calm.test/api/integrations/oura/callback?state=${state}&code=x`, { headers: { host: "calm.test", cookie: `${SESSION_COOKIE}=${createSession(b.id).token}` } }));
  assert.equal(res.status, 303);
  assert.match(res.headers.get("location")!, /result=bad_state/);
  assert.equal(connectionInfo(b.id).length + connectionInfo(a.id).length, 0);
});

// ---------- normalisation ----------
test("Oura normalisation: offsets kept, units explicit, missing values not invented", () => {
  const n = normaliseOuraSleep(sleepRow("x", "2026-11-01"));
  assert.equal(n.rejected, false);
  assert.deepEqual(n.readings.map((r) => [r.kind, r.unit]), [["sleep", "s"], ["resting_hr", "bpm"], ["hrv_rmssd", "ms"]]);
  assert.match(n.readings[0].start, /\+02:00$/);
  const partial = normaliseOuraSleep(sleepRow("y", "2026-11-01", { lowest_heart_rate: null, average_hrv: undefined }));
  assert.deepEqual(partial.readings.map((r) => r.kind), ["sleep"]);
  const mismatch = normaliseOuraSleep(sleepRow("z", "2026-11-01", { total_sleep_duration: 4 * 3600 }));
  assert.deepEqual(mismatch.readings.map((r) => r.kind), ["resting_hr", "hrv_rmssd"], "asleep time ≠ in-bed interval: no sleep segment fabricated");
  assert.equal(normaliseOuraSleep({ id: "q", bedtime_start: "2026-11-01 23:00", bedtime_end: "x" }).rejected, true, "no timezone → rejected");
});
