process.env.CALM_DB_PATH = ":memory:";
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectCrisis, crisisResources } from "../lib/safety";
import { addCheckIn, exportAll, getSettings, listCheckIns, saveSettings, wipeAll, normalizeTag } from "../lib/db";
import { seedDemo } from "../lib/seed";
import { snapshot } from "../lib/snapshot";
import { companionReply } from "../lib/companion";

test("crisis detection catches clear risk language", () => {
  for (const t of ["I want to die", "thinking about killing myself... I want to kill myself", "I don't want to be alive anymore", "everyone would be better off without me", "I've been self-harming again", "i keep thinking about suicide"]) {
    assert.ok(detectCrisis(t), t);
  }
});

test("crisis detection avoids common false positives", () => {
  for (const t of ["this deadline is killing me", "I'm dying to see that film", "my phone died", "dead tired after the gym", "I could kill for a coffee"]) {
    assert.ok(!detectCrisis(t), t);
  }
});

test("crisis resources always include an international fallback", () => {
  assert.ok(crisisResources("US").some((r) => r.contact.includes("988")));
  assert.ok(crisisResources("OTHER").some((r) => r.name === "Find a helpline"));
});

test("tags are normalised", () => {
  assert.equal(normalizeTag("  Late Screens! "), "late-screens");
});

test("check-ins round-trip; settings persist; wipe clears", () => {
  wipeAll();
  addCheckIn({ mood: 6, energy: 5, stress: 4, focus: null, sleepHours: 7.5, sleepQuality: 4, tags: ["Exercise", "exercise"], note: null, mode: "everyday" });
  const [c] = listCheckIns();
  assert.deepEqual(c.tags, ["exercise"]);
  saveSettings({ mode: "study", displayName: "Ari" });
  assert.equal(getSettings().mode, "study");
  assert.equal(exportAll().checkins.length, 1);
  wipeAll();
  assert.equal(listCheckIns().length, 0);
  assert.equal(getSettings().mode, "everyday");
});

test("demo seed yields an established, explainable snapshot", () => {
  seedDemo("work");
  const s = snapshot();
  assert.equal(s.pulse.stage, "established");
  assert.ok(s.radar.ready);
  assert.ok(s.recommendations.length > 0);
  assert.ok(s.checkins.every((c) => c.source === "demo"));
});

test("companion: crisis text is handled without any model call; missing key is explicit", async () => {
  delete process.env.ANTHROPIC_API_KEY; delete process.env.ANTHROPIC_AUTH_TOKEN;
  const crisis = await companionReply("I want to die");
  assert.equal(crisis.flagged, true);
  assert.ok(crisis.resources && crisis.resources.length > 0);
  const normal = await companionReply("Rough day at work");
  assert.equal(normal.configured, false);
  assert.match(normal.content, /ANTHROPIC_API_KEY/);
});
