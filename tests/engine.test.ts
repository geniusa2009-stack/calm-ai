import { test } from "node:test";
import assert from "node:assert/strict";
import { computeBaseline } from "../lib/engine/baseline";
import { computePulse } from "../lib/engine/pulse";
import { scanRadar } from "../lib/engine/radar";
import { tagEffects, sleepLinks } from "../lib/engine/context";
import { recoveryProfile } from "../lib/engine/recovery";
import { recommend, toolEfficacy } from "../lib/engine/support";
import { whatIf } from "../lib/engine/whatif";
import { weeklyInsights } from "../lib/engine/insights";
import { groupByDay, localDate } from "../lib/engine/days";
import { makeDays, wobble } from "./helpers";
import type { CheckIn, SupportSession } from "../lib/types";

const today = localDate(new Date());

test("baseline is personal: a naturally high-stress person's 7 is their usual", () => {
  const days = makeDays(30, (i) => ({ stress: 7 + wobble(i), mood: 5 + wobble(i) }));
  const b = computeBaseline(days, today);
  assert.ok(Math.abs(b.stress.center - 7) < 0.3, `center ${b.stress.center}`);
  assert.equal(b.stage, "established");
  const p = computePulse(days);
  assert.equal(p.state, "steady", "their usual should read as steady, not strained");
});

test("baseline shrinks toward priors with little data", () => {
  const days = makeDays(2, () => ({ stress: 9 }));
  const b = computeBaseline(days, today);
  assert.ok(b.stress.center < 9 && b.stress.center > 4.5);
  assert.equal(b.stage, "learning");
  assert.equal(computePulse(days).state, "learning");
});

test("pulse detects strain relative to baseline and explains drivers", () => {
  const days = makeDays(30, (i, ago) => (ago < 3 ? { stress: 8, mood: 3, energy: 3, sleepHours: 5 } : { stress: 4 + wobble(i), mood: 6 + wobble(i) }));
  const p = computePulse(days);
  assert.equal(p.state, "strained");
  assert.ok(p.score < 40);
  assert.ok(p.drivers.some((d) => d.metric === "stress"));
  assert.ok(p.confidence > 0.6);
});

test("pulse recognises running low (low energy without high stress)", () => {
  const days = makeDays(30, (i, ago) => (ago < 3 ? { energy: 2.5, stress: 4 } : { energy: 6 + wobble(i), stress: 4 + wobble(i) }));
  assert.equal(computePulse(days).state, "running-low");
});

test("pulse recognises recovery after a peak", () => {
  const days = makeDays(30, (i, ago) =>
    ago >= 3 && ago <= 6 ? { stress: 8.5, mood: 3, energy: 3 } : { stress: 4 + wobble(i), mood: 6 + wobble(i), energy: 6 + wobble(i) });
  const p = computePulse(days);
  assert.equal(p.state, "recovering", `got ${p.state} strain ${p.strain}`);
});

test("pulse confidence drops when data is stale", () => {
  const days = makeDays(30, (i) => ({ stress: 4 + wobble(i) })).slice(0, -2);
  assert.ok(computePulse(days).confidence < 0.8);
});

test("radar stays quiet on stable data and waits for 7 days", () => {
  assert.equal(scanRadar(makeDays(5)).ready, false);
  const r = scanRadar(makeDays(30, (i) => ({ stress: 4 + wobble(i), mood: 6 + wobble(i), sleepHours: 7 + wobble(i) / 2 })));
  assert.equal(r.ready, true);
  assert.equal(r.signals.filter((s) => s.severity !== "positive").length, 0, JSON.stringify(r.signals.map((s) => s.id)));
});

test("radar catches sustained stress and a sleep slide", () => {
  const days = makeDays(30, (i, ago) => ({
    stress: ago < 5 ? 7 : 4 + wobble(i),
    sleepHours: ago < 7 ? 7.2 - (7 - ago) * 0.25 : 7.2 + wobble(i) / 3,
  }));
  const ids = scanRadar(days).signals.map((s) => s.id);
  assert.ok(ids.includes("sustained-stress"), ids.join());
  assert.ok(ids.includes("sleep-slide"), ids.join());
});

test("radar catches the energy/stress scissors", () => {
  const days = makeDays(30, (i, ago) => (ago < 6 ? { stress: 4 + (6 - ago) * 0.6, energy: 6 - (6 - ago) * 0.6 } : { stress: 4 + wobble(i), energy: 6 + wobble(i) }));
  assert.ok(scanRadar(days).signals.some((s) => s.id === "scissors"));
});

test("context: finds a real tag effect and ignores a random tag", () => {
  const days = makeDays(40, (i) => {
    const deadline = i % 4 === 0, random = i % 3 === 1;
    return { stress: 4 + wobble(i) + (deadline ? 3 : 0), tags: [...(deadline ? ["deadline"] : []), ...(random ? ["blue-socks"] : [])] };
  });
  const fx = tagEffects(days);
  const dl = fx.find((e) => e.tag === "deadline" && e.metric === "stress");
  assert.ok(dl && dl.diff > 2.5 && dl.confidence === "high");
  assert.ok(!fx.some((e) => e.tag === "blue-socks" && e.confidence !== "low"));
});

test("context: needs at least 3 occurrences of a tag", () => {
  const days = makeDays(20, (i) => ({ tags: i < 2 ? ["rare"] : [], stress: i < 2 ? 9 : 4 }));
  assert.equal(tagEffects(days).filter((e) => e.tag === "rare").length, 0);
});

test("sleep link is learned from the person's own data", () => {
  const days = makeDays(30, (i) => { const sl = 6 + (i % 4) * 0.75; return { sleepHours: sl, stress: 9 - sl + wobble(i) * 0.3 }; });
  const l = sleepLinks(days).find((x) => x.metric === "stress");
  assert.ok(l && l.perHour < -0.7);
});

test("recovery: measures episode length", () => {
  const days = makeDays(40, (i, ago) => (ago <= 25 && ago >= 21 ? { stress: 9, mood: 2, energy: 2 } : { stress: 4 + wobble(i), mood: 6 + wobble(i), energy: 6 + wobble(i) }));
  const r = recoveryProfile(days, []);
  assert.equal(r.episodes.length, 1);
  assert.ok(r.episodes[0].end);
  assert.ok(r.typicalDays! >= 4 && r.typicalDays! <= 7, `typical ${r.typicalDays}`);
});

const sess = (tool: SupportSession["tool"], pre: number, post: number, n: number): SupportSession[] =>
  Array.from({ length: n }, (_, i) => ({ id: i, ts: new Date().toISOString(), tool, preStress: pre, postStress: post, helpful: pre - post >= 2 ? 1 : -1, durationSec: 60, note: null }));

test("support: personal efficacy re-ranks tools", () => {
  const sessions = [...sess("micro-reset", 7, 3, 5), ...sess("grounding", 7, 7, 5)];
  const eff = toolEfficacy(sessions);
  assert.ok(eff["micro-reset"].score > eff["grounding"].score);
  const morning = new Date(); morning.setHours(10);
  const recs = recommend("strained", sessions, "everyday", morning);
  const idx = (id: string) => recs.findIndex((r) => r.tool.id === id);
  assert.ok(idx("micro-reset") < idx("grounding"), recs.map((r) => r.tool.id).join());
  assert.match(recs[idx("micro-reset")].reason, /lowered your stress/);
});

test("support: evening favours wind-down tools", () => {
  const night = new Date(); night.setHours(22);
  const recs = recommend("running-low", [], "everyday", night);
  assert.ok(recs.slice(0, 3).some((r) => r.tool.evening));
});

test("what-if refuses with too little data and stays bounded with enough", () => {
  assert.equal(whatIf(makeDays(5), [], { sleepDelta: 1, reduceTags: [], addTags: [], dailySupport: false }).ready, false);
  const days = makeDays(40, (i) => ({ stress: 4 + wobble(i) + (i % 3 === 0 ? 3 : 0), tags: i % 3 === 0 ? ["deadline"] : [] }));
  const r = whatIf(days, [], { sleepDelta: 0, reduceTags: ["deadline"], addTags: [], dailySupport: false });
  const st = r.projections.find((p) => p.metric === "stress")!;
  assert.ok(st.projected < st.current && st.current - st.projected <= 2);
  assert.ok(st.low <= st.projected && st.high >= st.projected);
});

test("insights respect 'doesn't fit' feedback", () => {
  const days = makeDays(30, (i) => ({ stress: 4 + wobble(i) + (i % 4 === 0 ? 3 : 0), tags: i % 4 === 0 ? ["deadline"] : [] }));
  const all = weeklyInsights(days, [], {});
  const ctx = all.find((i) => i.kind === "context")!;
  assert.ok(ctx);
  const after = weeklyInsights(days, [], { [ctx.key]: -1 });
  assert.ok(!after.some((i) => i.key === ctx.key));
});

test("groupByDay averages multiple check-ins and unions tags", () => {
  const base: Omit<CheckIn, "id" | "ts" | "stress" | "tags"> = { mood: 5, energy: 5, focus: null, sleepHours: 7, sleepQuality: null, note: null, mode: "everyday", source: "manual" };
  const now = new Date();
  const days = groupByDay([
    { ...base, id: 1, ts: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9).toISOString(), stress: 4, tags: ["a"] },
    { ...base, id: 2, ts: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 18).toISOString(), stress: 8, tags: ["b"], sleepHours: null },
  ]);
  assert.equal(days.length, 1);
  assert.equal(days[0].stress, 6);
  assert.deepEqual(days[0].tags.sort(), ["a", "b"]);
  assert.equal(days[0].sleepHours, 7);
});
