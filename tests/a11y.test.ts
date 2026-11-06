import { test } from "node:test";
import assert from "node:assert/strict";
import { describeSeries } from "../components/charts";

test("chart text alternative: descriptive averages, range, latest and direction — no assessments", () => {
  const d = describeSeries([{ label: "Stress", color: "", values: [3, 4, null, 7, 8, 8] }, { label: "Mood", color: "", values: [6, 6, 6, 6] }], ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], { lo: 3, hi: 6 });
  assert.match(d, /6 points from Mon to Sat/);
  assert.match(d, /Stress averaged 6 \(range 3–8\), latest 8, higher in the second half/);
  assert.match(d, /Mood averaged 6 \(range 6–6\), latest 6, fairly steady/);
  assert.match(d, /usual range 3–6/);
  assert.doesNotMatch(d, /anxiety|depress|disorder|diagnos|risk|danger|alarming/i);
});

test("chart text alternative: empty series are described, not invented", () => {
  assert.match(describeSeries([{ label: "Sleep", color: "", values: [null, null] }], ["a", "b"]), /Sleep: no data/);
});
