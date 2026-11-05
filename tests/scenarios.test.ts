/**
 * Behavioural audit of the engine on reproducible synthetic scenarios.
 * Thresholds sit a margin above measured values (see scripts/audit-engine.ts).
 * These verify engineering behaviour only — they say nothing about clinical validity.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { scenario, rolling } from "./scenarios";
import { scanRadar } from "../lib/engine/radar";
import { computePulse } from "../lib/engine/pulse";
import { computeBaseline } from "../lib/engine/baseline";
import { tagEffects, sleepLinks } from "../lib/engine/context";
import { recoveryProfile } from "../lib/engine/recovery";
import { addDays, localDate } from "../lib/engine/days";
import { bhAdjust, tPValue, welch, pearsonP } from "../lib/engine/stats";

const SEEDS = 30;
const alarms = (r: ReturnType<typeof scanRadar>) => r.signals.filter((s) => s.severity === "notice" || s.severity === "act");

function alarmRate(opts: Parameters<typeof scenario>[0]) {
  let hit = 0, total = 0, strained = 0;
  for (let seed = 1; seed <= SEEDS; seed++) {
    for (const r of rolling(scenario({ days: 70, seed, ...opts }), 25, (v, now) => ({ a: alarms(scanRadar(v, now)).length, s: computePulse(v, now).state }))) {
      total++; if (r.value.a) hit++; if (r.value.s === "strained") strained++;
    }
  }
  return { rate: hit / total, strained: strained / total };
}

function firstDetection(opts: Parameters<typeof scenario>[0], onset: number, n = 90, within = 6) {
  const delays: (number | null)[] = [];
  for (let seed = 1; seed <= SEEDS; seed++) {
    const res = rolling(scenario({ days: n, seed, ...opts }), onset, (v, now) => alarms(scanRadar(v, now)).length > 0 || computePulse(v, now).state === "strained");
    const i = res.findIndex((r) => r.value);
    delays.push(i < 0 ? null : i);
  }
  const found = delays.filter((d): d is number => d != null).sort((a, b) => a - b);
  return { found: found.length, median: found[Math.floor(found.length / 2)] ?? Infinity, max: found.at(-1) ?? Infinity, quick: found.filter((d) => d <= within).length };
}

// ---------- stable ----------
test("stable: alarms on <5% of days and never 'strained' on pure noise", () => {
  const r = alarmRate({ noise: 1 });
  assert.ok(r.rate < 0.05, `alarm rate ${r.rate}`);
  assert.equal(r.strained, 0);
});

// ---------- noisy ----------
test("noisy (2x variability): alarm rate stays <8% because thresholds scale with personal spread", () => {
  const r = alarmRate({ noise: 2 });
  assert.ok(r.rate < 0.08, `alarm rate ${r.rate}`);
  assert.equal(r.strained, 0);
});

test("noisy: random tags almost never surface as patterns, and essentially never as 'high'", () => {
  let shown = 0, high = 0;
  for (let seed = 1; seed <= SEEDS; seed++) {
    const days = scenario({ days: 60, seed, noise: 1.5, tags: (_i, r) => ["a", "b", "c", "d", "e", "f"].filter(() => r() < 0.3) });
    const fx = tagEffects(days);
    shown += fx.length; high += fx.filter((e) => e.confidence === "high").length;
  }
  assert.ok(shown / SEEDS < 0.3, `shown per user ${shown / SEEDS}`);
  assert.ok(high / SEEDS <= 0.05, `high per user ${high / SEEDS}`);
});

test("noisy: a real tag effect is still found", () => {
  let found = 0;
  for (let seed = 1; seed <= SEEDS; seed++) {
    const days = scenario({ days: 60, seed, noise: 1.5, tags: (i) => (i % 4 === 0 ? ["deadline"] : []), stressShift: (i) => (i % 4 === 0 ? 2.5 : 0) });
    if (tagEffects(days).some((e) => e.tag === "deadline" && e.metric === "stress" && e.confidence !== "low")) found++;
  }
  assert.ok(found >= SEEDS * 0.9, `found in ${found}/${SEEDS}`);
});

// ---------- abrupt change ----------
test("abrupt change: +2.5 stress is caught in every seed, median ≤3 days, ≥90% within 6", () => {
  const d = firstDetection({ stressShift: (i) => (i >= 60 ? 2.5 : 0) }, 60);
  assert.equal(d.found, SEEDS);
  assert.ok(d.median <= 3, `median ${d.median}`);
  // Known tail: a stress-ONLY shift moves composite strain little, so a few seeds take
  // 1–2 weeks. Measured worst case 15 days. Documented in docs/ENGINE_AUDIT.md.
  assert.ok(d.quick >= SEEDS * 0.9, `within 6 days: ${d.quick}/${SEEDS}`);
  assert.ok(d.max <= 21, `max ${d.max}`);
});

test("abrupt change: pulse reads strained within days of a broad drop", () => {
  const days = scenario({ days: 60, seed: 5, stressShift: (i) => (i >= 56 ? 3.5 : 0), moodShift: (i) => (i >= 56 ? 3 : 0), energyShift: (i) => (i >= 56 ? 3 : 0) });
  assert.equal(computePulse(days, new Date(days.at(-1)!.date + "T20:00:00")).state, "strained");
});

// ---------- gradual change ----------
test("gradual change: a slow +3 stress rise over 60 days is detected in ≥90% of seeds", () => {
  const d = firstDetection({ stressShift: (i) => (i >= 30 ? ((i - 30) / 60) * 3 : 0) }, 30);
  assert.ok(d.found >= SEEDS * 0.9, `found ${d.found}`);
  assert.ok(d.median <= 30, `median ${d.median}`);
});

test("gradual change: long-horizon drift fires even after the short baseline has adapted", () => {
  let fired = 0;
  for (let seed = 1; seed <= SEEDS; seed++) {
    const days = scenario({ days: 110, seed, stressShift: (i) => (i >= 20 ? Math.min(2.5, ((i - 20) / 70) * 2.5) : 0) });
    if (scanRadar(days, new Date(days.at(-1)!.date + "T20:00:00")).signals.some((s) => s.id.startsWith("long-drift"))) fired++;
  }
  assert.ok(fired >= SEEDS * 0.8, `fired ${fired}/${SEEDS}`);
});

test("gradual change: the 35-day baseline does adapt (documented behaviour, not a bug)", () => {
  const days = scenario({ days: 110, seed: 2, noise: 0.5, stressShift: (i) => (i >= 20 ? Math.min(2.5, ((i - 20) / 70) * 2.5) : 0) });
  const b = computeBaseline(days, days.at(-1)!.date);
  assert.ok(b.stress.center >= 6, `center ${b.stress.center}`); // has moved from ~4.5
});

// ---------- missing data ----------
test("missing data: 40% missing days does not raise the false-alarm rate", () => {
  const r = alarmRate({ noise: 1, missingRate: 0.4 });
  assert.ok(r.rate < 0.05, `alarm rate ${r.rate}`);
});

test("missing data: confidence drops with staleness and missing metrics", () => {
  const full = scenario({ days: 40, seed: 3 });
  const end = new Date(full.at(-1)!.date + "T20:00:00");
  const c0 = computePulse(full, end).confidence;
  const stale = full.slice(0, -2);
  const c1 = computePulse(stale, end).confidence;
  const noMetrics = full.map((d) => ({ ...d, sleepHours: null, focus: null }));
  const c2 = computePulse(noMetrics, end).confidence;
  assert.ok(c1 < c0 && c2 < c0, `${c0} ${c1} ${c2}`);
});

test("missing data: an established user with a long gap is told so, not 'getting to know you'", () => {
  const days = scenario({ days: 40, seed: 3 }).slice(0, -6);
  const p = computePulse(days, new Date(addDays(localDate(new Date()), 0) + "T20:00:00"));
  assert.equal(p.state, "no-recent");
  assert.match(p.confidenceText, /days ago/);
});

test("missing data: recovery episodes spanning a gap are flagged uncertain and not averaged", () => {
  const ep = scenario({ days: 60, seed: 3, stressShift: (i) => (i >= 30 && i < 36 ? 4 : 0), moodShift: (i) => (i >= 30 && i < 36 ? 3 : 0) });
  const gappy = ep.filter((_, i) => !(i >= 33 && i < 45));
  const r = recoveryProfile(gappy, []);
  assert.ok(r.episodes.some((e) => e.uncertain));
  assert.equal(r.typicalDays, null);
  const clean = recoveryProfile(ep, []);
  assert.ok(clean.episodes.every((e) => !e.uncertain) && clean.typicalDays != null);
});

test("missing data: a single rough day is not a 'harder stretch'", () => {
  const days = scenario({ days: 50, seed: 4, noise: 0.5, stressShift: (i) => (i === 30 ? 3.5 : 0) });
  assert.equal(recoveryProfile(days, []).episodes.length, 0);
});

test("missing data: sleep link needs ≥10 nights and survives missing sleep reports", () => {
  const days = scenario({ days: 60, seed: 7, sleepMissingRate: 0.5 });
  assert.doesNotThrow(() => sleepLinks(days));
  assert.equal(sleepLinks(days.slice(0, 12).map((d) => ({ ...d, sleepHours: null }))).length, 0);
});

// ---------- leakage & ordering ----------
test("no leakage: the day being judged never defines its own baseline", () => {
  const today = localDate(new Date());
  for (const n of [4, 8, 30]) {
    const days = scenario({ days: n, seed: 9 });
    const a = computeBaseline(days.map((d) => (d.date === today ? { ...d, stress: 1 } : d)), today);
    const b = computeBaseline(days.map((d) => (d.date === today ? { ...d, stress: 10 } : d)), today);
    assert.equal(a.stress.center, b.stress.center, `n=${n}`);
  }
});

test("ordering: future-dated and unsorted days are handled", () => {
  const days = scenario({ days: 30, seed: 2 });
  const end = new Date(days.at(-1)!.date + "T20:00:00");
  const future = { ...days.at(-1)!, date: addDays(days.at(-1)!.date, 3), stress: 10, mood: 1 };
  const shuffled = [...days].reverse();
  assert.equal(computePulse([...days, future], end).state, computePulse(days, end).state);
  assert.equal(computePulse(shuffled.sort((a, b) => (a.date < b.date ? -1 : 1)), end).score, computePulse(days, end).score);
  assert.deepEqual(scanRadar([...days, future], end).signals.map((s) => s.id), scanRadar(days, end).signals.map((s) => s.id));
});

// ---------- statistics helpers ----------
test("stats: t-distribution p-values match reference tables", () => {
  assert.ok(Math.abs(tPValue(2.228, 10) - 0.05) < 0.001);
  assert.ok(Math.abs(tPValue(1.96, 1e6) - 0.05) < 0.001);
  assert.ok(Math.abs(tPValue(12.706, 1) - 0.05) < 0.001);
  assert.equal(tPValue(0, 5), 1);
});

test("stats: Welch handles tiny and constant groups without false certainty", () => {
  assert.equal(welch([5, 5, 5], [5, 5, 5]).p, 1);
  assert.equal(welch([1], [2, 3]).p, 1);
  assert.ok(welch([1, 2, 3, 4, 5], [6, 7, 8, 9, 10]).p < 0.002); // t=-5, df=8 → p≈0.00105
  assert.ok(pearsonP(0.25, 8) > 0.4); // r=0.25 on 8 points is not evidence
});

test("stats: Benjamini–Hochberg matches the worked example", () => {
  const q = bhAdjust([0.01, 0.04, 0.03, 0.005]);
  assert.deepEqual(q.map((x) => Math.round(x * 1000) / 1000), [0.02, 0.04, 0.04, 0.02]);
});
