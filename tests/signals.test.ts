process.env.CALM_DB_PATH = ":memory:";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { useDatabase, exportAll, countUserRows, addCheckIn } from "../lib/db";
import { register, createSession, createDemoUser, SESSION_COOKIE, deleteAccount } from "../lib/auth";
import { validateReading } from "../lib/signals/validate";
import { ingest, listReadings } from "../lib/signals/store";
import { dailySignals, mergeSignals, unionLength, attributionDate } from "../lib/signals/daily";
import { PROVIDERS } from "../lib/signals/providers";
import { syncProvider } from "../lib/signals/sync";
import { groupByDay, localDate, addDays } from "../lib/engine/days";
import { snapshot } from "../lib/snapshot";

const ROOT = path.join(__dirname, "..");
const NOW = Date.parse("2026-11-05T12:00:00Z");
const iso = (s: string) => new Date(s).toISOString();
const sleep = (id: string | undefined, start: string, end: string, extra: object = {}) => {
  const h = (Date.parse(end) - Date.parse(start)) / 3600e3;
  return { ...(id ? { id } : {}), kind: "sleep", value: Math.round(h * 60), unit: "min", start, end, tzOffsetMinutes: 0, ...extra };
};

beforeEach(() => { useDatabase(); });

// ---------- validation & normalisation ----------
test("validation: converts units to canonical form", () => {
  const r = validateReading(sleep("a", "2026-11-04T23:00:00Z", "2026-11-05T07:00:00Z"), "p", NOW);
  assert.ok(r.ok && r.reading.value === 8 && r.reading.kind === "sleep");
  const hrv = validateReading({ kind: "hrv_rmssd", value: 0.045, unit: "s", start: "2026-11-05T06:00:00Z", end: "2026-11-05T06:05:00Z" }, "p", NOW);
  assert.ok(hrv.ok && hrv.reading.value === 45);
});

test("validation: rejects malformed, implausible and impossible readings with reasons (never clamps)", () => {
  const base = { kind: "resting_hr", value: 60, unit: "bpm", start: "2026-11-05T06:00:00Z", end: "2026-11-05T06:30:00Z" };
  const cases: [object, RegExp][] = [
    [{ ...base, kind: "blood_alcohol" }, /unknown kind/],
    [{ ...base, value: Number.NaN }, /finite/],
    [{ ...base, value: "60" }, /finite/],
    [{ ...base, unit: "furlongs" }, /unit/],
    [{ ...base, value: 400 }, /plausible/],
    [{ ...base, value: 10 }, /plausible/],
    [{ ...base, start: "2026-11-05 06:00" }, /ISO-8601/],
    [{ ...base, start: "2026-11-05T06:00:00" }, /ISO-8601/], // no offset → ambiguous
    [{ ...base, end: "2026-11-05T05:00:00Z" }, /before start/],
    [{ ...base, start: "2026-11-06T06:00:00Z", end: "2026-11-06T06:30:00Z" }, /future/],
    [{ ...base, start: "2020-01-01T06:00:00Z", end: "2020-01-01T06:30:00Z" }, /too old/],
    [{ ...base, tzOffsetMinutes: 2000 }, /tzOffsetMinutes/],
    [{ kind: "sleep", value: 600, unit: "min", start: "2026-11-04T23:00:00Z", end: "2026-11-05T07:00:00Z" }, /doesn't match/],
    [null as unknown as object, /not an object/],
  ];
  for (const [raw, reason] of cases) {
    const v = validateReading(raw, "p", NOW);
    assert.ok(!v.ok, JSON.stringify(raw));
    if (!v.ok) assert.match(v.reason, reason);
  }
});

// ---------- duplicates, corrections, ordering, delays ----------
test("ingest: re-delivery is idempotent; same id with a new value is a correction", async () => {
  const u = await register("dup@example.com", "correct horse battery");
  const batch = [sleep("n1", "2026-11-03T23:00:00Z", "2026-11-04T07:00:00Z"), sleep("n2", "2026-11-04T23:30:00Z", "2026-11-05T06:30:00Z")];
  assert.equal(ingest(u.id, "file-import", batch, NOW).inserted, 2);
  const again = ingest(u.id, "file-import", batch, NOW);
  assert.deepEqual([again.inserted, again.updated, again.duplicates], [0, 0, 2]);
  const fixed = ingest(u.id, "file-import", [sleep("n2", "2026-11-04T23:00:00Z", "2026-11-05T06:30:00Z")], NOW);
  assert.equal(fixed.updated, 1);
  assert.equal(listReadings(u.id, 100000).length, 2);
  // Readings without ids are de-duplicated by content
  const anon = [{ kind: "steps", value: 4000, unit: "count", start: "2026-11-04T08:00:00Z", end: "2026-11-04T20:00:00Z" }];
  ingest(u.id, "file-import", anon, NOW);
  assert.equal(ingest(u.id, "file-import", anon, NOW).duplicates, 1);
  // Duplicates inside one batch
  assert.equal(ingest(u.id, "file-import", [anon[0], anon[0]], NOW).duplicates, 2);
});

test("ingest: out-of-order and delayed arrivals give the same daily result as in-order", async () => {
  const a = await register("order-a@example.com", "correct horse battery");
  const b = await register("order-b@example.com", "correct horse battery");
  const readings = Array.from({ length: 10 }, (_, i) => {
    const day = addDays("2026-10-25", i);
    return sleep(`s${i}`, `${addDays(day, -1)}T23:00:00Z`, `${day}T0${5 + (i % 3)}:00:00Z`);
  });
  ingest(a.id, "file-import", readings, NOW);
  const shuffled = [...readings].reverse();
  ingest(b.id, "file-import", shuffled.slice(0, 5), NOW);
  const late = ingest(b.id, "file-import", shuffled.slice(5), NOW + 3 * 864e5); // three days late
  assert.ok(late.maxDelayHours! > 72);
  const da = dailySignals(listReadings(a.id, 100000)), db2 = dailySignals(listReadings(b.id, 100000));
  assert.deepEqual([...da.entries()].sort(), [...db2.entries()].sort());
});

test("ingest: batch limit and per-reading rejections are reported, valid ones still land", async () => {
  const u = await register("batch@example.com", "correct horse battery");
  const r = ingest(u.id, "file-import", [sleep("ok", "2026-11-04T23:00:00Z", "2026-11-05T07:00:00Z"), { kind: "sleep", value: -1, unit: "min" }], NOW);
  assert.equal(r.inserted, 1);
  assert.equal(r.rejected.length, 1);
  assert.equal(r.rejected[0].index, 1);
  const big = ingest(u.id, "file-import", new Array(5001).fill({}), NOW);
  assert.equal(big.inserted, 0);
  assert.match(big.rejected[0].reason, /batch too large/);
});

// ---------- aggregation ----------
test("aggregation: overlapping sleep segments are never double counted", () => {
  assert.equal(unionLength([[0, 10], [5, 15], [20, 25]]), 20);
  const rs = [
    { provider: "x", externalId: "1", kind: "sleep" as const, value: 6, start: iso("2026-11-04T23:00:00Z"), end: iso("2026-11-05T05:00:00Z"), tzOffsetMinutes: 0 },
    { provider: "x", externalId: "2", kind: "sleep" as const, value: 3, start: iso("2026-11-05T04:00:00Z"), end: iso("2026-11-05T07:00:00Z"), tzOffsetMinutes: 0 },
  ];
  assert.equal(dailySignals(rs).get("2026-11-05")!.sleepHours, 8);
});

test("aggregation: two providers for the same night are not summed", () => {
  const night = (provider: string, id: string) => ({ provider, externalId: id, kind: "sleep" as const, value: 7, start: iso("2026-11-05T00:00:00Z"), end: iso("2026-11-05T07:00:00Z"), tzOffsetMinutes: 0 });
  const d = dailySignals([night("a", "1"), night("b", "2")]).get("2026-11-05")!;
  assert.equal(d.sleepHours, 7);
});

test("aggregation: device timezone decides which local day a reading belongs to", () => {
  // 23:30 UTC on Nov 4 is 08:30 on Nov 5 in UTC+9
  assert.equal(attributionDate("2026-11-04T23:30:00Z", 540), "2026-11-05");
  assert.equal(attributionDate("2026-11-04T23:30:00Z", -300), "2026-11-04");
});

test("merge: self-reported sleep wins; wearable sleep only fills gaps; signals never create days", async () => {
  const u = await register("merge@example.com", "correct horse battery");
  const today = localDate(new Date());
  const y = addDays(today, -1);
  addCheckIn(u.id, { ts: new Date(`${y}T12:00:00`).toISOString(), mood: 6, energy: 6, stress: 4, focus: null, sleepHours: 7.5, sleepQuality: 3, tags: [], note: null, mode: "everyday" });
  addCheckIn(u.id, { ts: new Date(`${today}T12:00:00`).toISOString(), mood: 6, energy: 6, stress: 4, focus: null, sleepHours: null, sleepQuality: null, tags: [], note: null, mode: "everyday" });
  const mk = (day: string, hours: number) => {
    const end = new Date(`${day}T07:00:00`); const start = new Date(end.getTime() - hours * 3600e3);
    return { id: `w-${day}`, kind: "sleep", value: hours * 60, unit: "min", start: start.toISOString(), end: end.toISOString() };
  };
  ingest(u.id, "file-import", [mk(y, 5), mk(today, 6), mk(addDays(today, -5), 8)]);
  const s = snapshot(u.id);
  const byDate = new Map(s.days.map((d) => [d.date, d]));
  assert.equal(byDate.get(y)!.sleepHours, 7.5, "self-report kept");
  assert.equal(byDate.get(today)!.sleepHours, 6, "gap filled from wearable");
  assert.equal(s.days.length, 2, "wearable-only day not created");
  assert.equal(mergeSignals(groupByDay([]), new Map()).length, 0);
});

// ---------- providers & access ----------
test("providers: registry is honest — only file import is implemented, demo is demo-only, the rest can't run", async () => {
  const byStatus = (st: string) => PROVIDERS.filter((p) => p.status === st).map((p) => p.id);
  assert.deepEqual(byStatus("implemented"), ["file-import"]);
  assert.deepEqual(byStatus("demo"), ["demo"]);
  for (const p of PROVIDERS.filter((x) => x.status === "not-implemented")) {
    assert.equal(p.fetchReadings, undefined, `${p.id} must not pretend to fetch data`);
    assert.match(p.description, /^Not implemented/);
  }
  const real = await register("prov@example.com", "correct horse battery");
  await assert.rejects(syncProvider(real, "demo"), /demo account/);
  await assert.rejects(syncProvider(real, "oura"), /isn't available/);
  await assert.rejects(syncProvider(real, "nope"), /Unknown provider/);
  const demo = createDemoUser();
  const r = await syncProvider(demo, "demo");
  assert.ok(r.inserted > 50 && r.rejected.length === 0, JSON.stringify(r));
  assert.equal((await syncProvider(demo, "demo")).inserted, 0, "re-sync is idempotent");
});

test("isolation: signals are per-user through the API; export includes them; deletion cascades", async () => {
  const A = await register("sig-a@example.com", "correct horse battery");
  const B = await register("sig-b@example.com", "correct horse battery");
  const ta = createSession(A.id).token, tb = createSession(B.id).token;
  const imp = (await import(path.join(ROOT, "app/api/signals/import/route.ts"))).POST as (r: Request) => Promise<Response>;
  const list = (await import(path.join(ROOT, "app/api/signals/route.ts"))) as { GET: (r: Request) => Promise<Response>; DELETE: (r: Request) => Promise<Response> };
  const req = (m: string, url: string, token: string | null, body?: string) => new Request("http://calm.test" + url, {
    method: m, body, headers: { host: "calm.test", origin: "http://calm.test", "content-type": "application/json", ...(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}) },
  });
  const now = new Date(); const end = new Date(now.getTime() - 3600e3); const start = new Date(end.getTime() - 7 * 3600e3);
  const body = JSON.stringify({ readings: [{ id: "a1", kind: "sleep", value: 420, unit: "min", start: start.toISOString(), end: end.toISOString() }] });

  assert.equal((await imp(req("POST", "/api/signals/import", null, body))).status, 401);
  const res = await imp(req("POST", "/api/signals/import", ta, body));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).report.inserted, 1);
  assert.equal(listReadings(B.id).length, 0);
  const bView = await (await list.GET(req("GET", "/api/signals", tb))).json();
  assert.equal(bView.connections.length, 0);
  await list.DELETE(req("DELETE", "/api/signals?provider=file-import", tb)); // B removing "file-import" must not touch A
  assert.equal(listReadings(A.id).length, 1);
  assert.equal((exportAll(A.id).signalReadings as unknown[]).length, 1);
  assert.equal((exportAll(B.id).signalReadings as unknown[]).length, 0);
  assert.equal((await imp(req("POST", "/api/signals/import", ta, "x".repeat(2_000_001)))).status, 400);
  await deleteAccount(A.id, "correct horse battery");
  assert.equal(countUserRows(A.id).signal_readings, 0);
  assert.equal(countUserRows(A.id).signal_connections, 0);
});
