// Measures engine behaviour across many seeded scenarios. Run: npx tsx scripts/audit-engine.ts
import { scenario, rolling } from "../tests/scenarios";
import { scanRadar } from "../lib/engine/radar";
import { computePulse } from "../lib/engine/pulse";
import { tagEffects, sleepLinks, weekdayPatterns } from "../lib/engine/context";
import { recoveryProfile } from "../lib/engine/recovery";

const SEEDS = 40;
const alarm = (v: ReturnType<typeof scanRadar>) => v.signals.filter((s) => s.severity === "notice" || s.severity === "act");

function fpRate(noise: number, missing = 0) {
  let alarmDays = 0, total = 0, strainedDays = 0;
  const byId: Record<string, number> = {};
  for (let seed = 1; seed <= SEEDS; seed++) {
    const days = scenario({ days: 70, seed, noise, missingRate: missing });
    for (const r of rolling(days, 25, (v, now) => ({ radar: scanRadar(v, now), pulse: computePulse(v, now) }))) {
      total++;
      const a = alarm(r.value.radar);
      if (a.length) alarmDays++;
      a.forEach((s) => (byId[s.id] = (byId[s.id] ?? 0) + 1));
      r.value.radar.signals.filter((s) => s.severity === "gentle").forEach((s) => (byId["gentle:" + s.id] = (byId["gentle:" + s.id] ?? 0) + 1));
      if (r.value.pulse.state === "strained") strainedDays++;
    }
  }
  return { alarmDayRate: +(alarmDays / total).toFixed(3), strainedRate: +(strainedDays / total).toFixed(3), perSignal: Object.fromEntries(Object.entries(byId).map(([k, v]) => [k, +(v / total).toFixed(3)])) };
}

function detection(label: string, shift: (i: number, n: number) => number, onset: number, field: "stressShift" | "sleepShift" = "stressShift") {
  const delays: number[] = []; let missed = 0;
  for (let seed = 1; seed <= SEEDS; seed++) {
    const days = scenario({ days: 90, seed, [field]: shift });
    const res = rolling(days, onset, (v, now) => alarm(scanRadar(v, now)).length > 0 || computePulse(v, now).state === "strained");
    const hit = res.findIndex((r) => r.value);
    if (hit < 0) missed++; else delays.push(hit);
  }
  delays.sort((a, b) => a - b);
  console.log(label, { detected: `${SEEDS - missed}/${SEEDS}`, medianDelayDays: delays[Math.floor(delays.length / 2)] ?? null });
}

console.log("STABLE noise=1", fpRate(1));
console.log("NOISY noise=2", fpRate(2));
console.log("MISSING 40%", fpRate(1, 0.4));
detection("ABRUPT +2.5 stress at day 60", (i) => (i >= 60 ? 2.5 : 0), 60);
detection("GRADUAL +3 stress over days 30-90", (i) => (i >= 30 ? ((i - 30) / 60) * 3 : 0), 30);
detection("GRADUAL sleep -1.5h over days 40-90", (i) => (i >= 40 ? ((i - 40) / 50) * 1.5 : 0), 40, "sleepShift");

// Context false positives: random tags with no effect
let shown = 0, med = 0, high = 0, tests = 0, sleepFP = 0, wkFP = 0;
for (let seed = 1; seed <= SEEDS; seed++) {
  const days = scenario({ days: 60, seed, tags: (i, r) => ["a", "b", "c", "d", "e", "f"].filter(() => r() < 0.3) });
  const fx = tagEffects(days);
  tests += 6 * 7;
  shown += fx.length; med += fx.filter((e) => e.confidence === "medium").length; high += fx.filter((e) => e.confidence === "high").length;
  sleepFP += sleepLinks(days).length; wkFP += weekdayPatterns(days).length;
}
console.log("CONTEXT null tags (per user):", { shown: shown / SEEDS, medium: med / SEEDS, high: high / SEEDS, sleepLinksShown: sleepFP / SEEDS, weekdayShown: wkFP / SEEDS });

// Recovery under gaps
const ep = scenario({ days: 60, seed: 3, stressShift: (i) => (i >= 30 && i < 36 ? 4 : 0), moodShift: (i) => (i >= 30 && i < 36 ? 3 : 0) });
const gappy = ep.filter((d, i) => !(i >= 33 && i < 45));
const show = (x: typeof ep) => { const r = recoveryProfile(x, []); return { episodes: r.episodes.map((e) => `${e.days}d${e.uncertain ? " (uncertain, gap " + e.maxGap + "d)" : ""}`), typical: r.typicalDays }; };
console.log("RECOVERY full:", show(ep), "with 12-day gap:", show(gappy));
