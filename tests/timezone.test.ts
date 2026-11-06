/**
 * Timezone regression tests. Every instant is a fixed literal; nothing depends on the real
 * clock or on the machine's timezone (the whole suite is also run under several TZ values).
 */
process.env.CALM_DB_PATH = ":memory:";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  addDays, canonicalTimeZone, dayLengthHours, daysBetween, formatDay, formatInstant, isValidTimeZone, localDate, localParts,
  resolveTimeZone, tzOffsetMinutes, weekdayOf, zonedTimeToUtc,
} from "../lib/time";
import { groupByDay } from "../lib/engine/days";
import { computePulse } from "../lib/engine/pulse";
import { recommend } from "../lib/engine/support";
import { weekKey } from "../lib/engine/insights";
import { validateReading } from "../lib/signals/validate";
import { dailySignals } from "../lib/signals/daily";
import type { CheckIn } from "../lib/types";
import { useDatabase, addCheckIn, saveSettings, getSettings } from "../lib/db";
import { register } from "../lib/auth";
import { snapshot } from "../lib/snapshot";

const ci = (id: number, ts: string, tz: string | null, stress = 5): CheckIn => ({
  id, ts, tz, mood: 5, energy: 5, stress, focus: null, sleepHours: null, sleepQuality: null, tags: [], note: null, mode: "everyday", source: "manual",
});

// ---------- primitives ----------
test("UTC vs local: the same instant is a different calendar date in different zones", () => {
  const t = "2026-11-05T22:30:00Z";
  assert.equal(localDate(t, "UTC"), "2026-11-05");
  assert.equal(localDate(t, "Africa/Cairo"), "2026-11-06"); // UTC+2 in November → 00:30
  assert.equal(localDate(t, "Asia/Tokyo"), "2026-11-06");
  assert.equal(localDate(t, "America/New_York"), "2026-11-05");
  assert.equal(localDate(t, "Pacific/Kiritimati"), "2026-11-06"); // UTC+14
  assert.equal(localDate(t, "Pacific/Pago_Pago"), "2026-11-05"); // UTC-11
  assert.equal(localDate(t), "2026-11-05", "default is UTC, never the server zone");
});

test("offsets come from the IANA database, including non-hour offsets", () => {
  const winter = Date.parse("2026-01-15T12:00:00Z"), summer = Date.parse("2026-07-15T12:00:00Z");
  assert.equal(tzOffsetMinutes(winter, "Africa/Cairo"), 120);
  assert.equal(tzOffsetMinutes(summer, "Africa/Cairo"), 180); // Egypt observes DST again since 2023
  assert.equal(tzOffsetMinutes(winter, "Asia/Kolkata"), 330);
  assert.equal(tzOffsetMinutes(winter, "Asia/Kathmandu"), 345);
  assert.equal(tzOffsetMinutes(winter, "America/New_York"), -300);
  assert.equal(tzOffsetMinutes(summer, "America/New_York"), -240);
  assert.equal(tzOffsetMinutes(winter, "Australia/Lord_Howe"), 660); // 30-minute DST
  assert.equal(tzOffsetMinutes(summer, "Australia/Lord_Howe"), 630);
});

test("DST: local days can be 23 or 25 hours long", () => {
  assert.equal(dayLengthHours("2026-03-08", "America/New_York"), 23);
  assert.equal(dayLengthHours("2026-11-01", "America/New_York"), 25);
  assert.equal(dayLengthHours("2026-03-29", "Europe/London"), 23);
  assert.equal(dayLengthHours("2026-10-25", "Europe/London"), 25);
  assert.equal(dayLengthHours("2026-06-15", "Asia/Tokyo"), 24);
  // Cairo: exactly one short and one long day in 2026, spring then autumn.
  const lengths: [string, number][] = [];
  for (let d = "2026-01-01"; d < "2027-01-01"; d = addDays(d, 1)) { const h = dayLengthHours(d, "Africa/Cairo"); if (h !== 24) lengths.push([d, h]); }
  assert.equal(lengths.length, 2, JSON.stringify(lengths));
  assert.equal(lengths[0][1], 23); assert.equal(lengths[1][1], 25);
  assert.ok(lengths[0][0] > "2026-03-31" && lengths[1][0] > "2026-09-30");
});

test("calendar arithmetic ignores DST: neighbours of a 23h/25h day are exactly one day away", () => {
  assert.equal(addDays("2026-03-08", 1), "2026-03-09");
  assert.equal(addDays("2026-11-01", -1), "2026-10-31");
  assert.equal(daysBetween("2026-03-01", "2026-03-31"), 30);
  assert.equal(daysBetween("2026-10-20", "2026-11-05"), 16);
  assert.equal(addDays("2028-02-28", 1), "2028-02-29"); // leap year
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
});

test("wall-clock → instant: normal, DST gap (spring) and overlap (autumn) are deterministic", () => {
  assert.equal(zonedTimeToUtc("2026-11-05", 23, 30, "Africa/Cairo").toISOString(), "2026-11-05T21:30:00.000Z");
  assert.equal(zonedTimeToUtc("2026-03-08", 2, 30, "America/New_York").toISOString(), "2026-03-08T07:30:00.000Z"); // gap → 03:30 EDT
  assert.equal(localParts("2026-03-08T07:30:00Z", "America/New_York").hour, 3);
  assert.equal(zonedTimeToUtc("2026-11-01", 1, 30, "America/New_York").toISOString(), "2026-11-01T05:30:00.000Z"); // ambiguous → earlier
  assert.equal(zonedTimeToUtc("2026-11-05", 0, 0, "Asia/Kathmandu").toISOString(), "2026-11-04T18:15:00.000Z");
});

test("weekday and ISO week come from the calendar date, not from any zone", () => {
  assert.equal(weekdayOf("2026-11-05"), 4); // Thursday
  assert.equal(weekdayOf("2026-03-08"), 0); // a DST Sunday
  assert.equal(weekKey("2026-01-01"), "2026-W01");
  assert.equal(weekKey("2027-01-01"), "2026-W53");
  assert.equal(weekKey("2026-12-28"), "2026-W53");
  assert.equal(formatDay("2026-11-05", { weekday: "long" }), "Thursday");
});

test("formatting is deterministic: same output whatever the machine's zone (no hydration drift)", () => {
  assert.equal(formatInstant("2026-11-05T22:30:00Z", "Africa/Cairo", { dateStyle: "medium", timeStyle: "short" }), "Nov 6, 2026, 12:30 AM");
  assert.equal(formatInstant("2026-11-05T22:30:00Z", "America/New_York", { dateStyle: "medium" }), "Nov 5, 2026");
});

test("zone validation: IANA ids only, canonicalised; offsets and junk rejected; UTC fallback", () => {
  assert.equal(canonicalTimeZone("africa/cairo"), "Africa/Cairo");
  for (const bad of ["+02:00", "GMT+2", "2", "Mars/Phobos", "", null, 7, "A".repeat(80)]) assert.equal(isValidTimeZone(bad), false, String(bad));
  assert.equal(resolveTimeZone(""), "UTC");
  assert.equal(resolveTimeZone("Not/AZone"), "UTC");
  assert.equal(resolveTimeZone("Africa/Cairo"), "Africa/Cairo");
});

// ---------- daily aggregation ----------
test("midnight boundary: a Cairo user's 23:30 and 08:00 check-ins are two different days", () => {
  const days = groupByDay([ci(1, "2026-11-05T21:30:00Z", "Africa/Cairo"), ci(2, "2026-11-06T06:00:00Z", "Africa/Cairo")]);
  assert.deepEqual(days.map((d) => [d.date, d.count]), [["2026-11-05", 1], ["2026-11-06", 1]]);
});

test("travel: past entries keep the day they were recorded on; legacy rows use the current zone", () => {
  // Recorded in Cairo at 01:00 local on 6 Nov; the person now lives in New York.
  const recorded = groupByDay([ci(1, "2026-11-05T23:00:00Z", "Africa/Cairo")], "America/New_York");
  assert.equal(recorded[0].date, "2026-11-06");
  const legacy = groupByDay([ci(1, "2026-11-05T23:00:00Z", null)], "America/New_York");
  assert.equal(legacy[0].date, "2026-11-05", "a row with no recorded zone follows the user's current zone");
});

test("historical data across a DST change: one entry per local day, no gaps or doubles", () => {
  const tz = "America/New_York";
  const rows = [];
  for (let i = 0; i < 10; i++) { const day = addDays("2026-10-27", i); rows.push(ci(i, zonedTimeToUtc(day, 21, 0, tz).toISOString(), tz)); }
  const days = groupByDay(rows, tz);
  assert.equal(days.length, 10);
  assert.deepEqual(days.map((d) => d.date), Array.from({ length: 10 }, (_, i) => addDays("2026-10-27", i)));
});

test("'today' for the Pulse is the person's local date", () => {
  const now = new Date("2026-11-05T23:30:00Z"); // 01:30 on 6 Nov in Cairo
  const days = groupByDay([ci(1, "2026-11-05T23:00:00Z", "Africa/Cairo")]);
  assert.equal(days[0].date, "2026-11-06");
  const cairo = computePulse(days, now, "Africa/Cairo");
  assert.equal(cairo.lastCheckIn, "2026-11-06");
  assert.notEqual(cairo.state, "no-recent");
  // For a UTC observer 'today' is 5 Nov, so a 6 Nov entry is in the future and ignored.
  assert.equal(computePulse(days, now, "UTC").lastCheckIn, null);
});

test("evening tool ranking uses the person's local hour", () => {
  const now = new Date("2026-11-05T20:30:00Z"); // 22:30 Cairo, 15:30 New York
  const score = (tz: string, id: string) => recommend("running-low", [], "everyday", now, tz).find((r) => r.tool.id === id)!.score;
  // Evening tools get the evening boost only where it is actually evening.
  assert.ok(score("Africa/Cairo", "wind-down") - score("America/New_York", "wind-down") >= 0.45);
  assert.equal(score("Africa/Cairo", "micro-reset"), score("America/New_York", "micro-reset"), "non-evening tools unaffected");
  assert.deepEqual(recommend("running-low", [], "everyday", now, "Africa/Cairo").slice(0, 3).map((r) => r.tool.evening), [true, true, true]);
});

// ---------- sleep & wearables ----------
test("cross-midnight sleep belongs to the local wake-up day", () => {
  const r = validateReading({ id: "s1", kind: "sleep", value: 480, unit: "min", start: "2026-11-04T21:00:00Z", end: "2026-11-05T05:00:00Z", timeZone: "Africa/Cairo" }, "p", Date.parse("2026-11-06T00:00:00Z"));
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.reading.tzOffsetMinutes, 120);
  assert.equal(dailySignals([r.reading], "UTC").get("2026-11-05")!.sleepHours, 8);
});

test("sleep across the autumn DST change: duration is real elapsed time (9h across a 25h night)", () => {
  // London 23:00 BST on 24 Oct → 07:00 GMT on 25 Oct = 9 hours elapsed.
  const start = zonedTimeToUtc("2026-10-24", 23, 0, "Europe/London").toISOString();
  const end = zonedTimeToUtc("2026-10-25", 7, 0, "Europe/London").toISOString();
  const nine = validateReading({ id: "dst", kind: "sleep", value: 540, unit: "min", start, end, timeZone: "Europe/London" }, "p", Date.parse("2026-10-26T00:00:00Z"));
  assert.ok(nine.ok);
  const eight = validateReading({ id: "dst", kind: "sleep", value: 480, unit: "min", start, end }, "p", Date.parse("2026-10-26T00:00:00Z"));
  assert.ok(!eight.ok, "a duration that ignores the extra hour is rejected, not silently accepted");
  if (nine.ok) assert.equal(dailySignals([nine.reading]).get("2026-10-25")!.sleepHours, 9);
});

test("missing zone information is explicit: falls back to the user's zone, never invented", () => {
  const r = validateReading({ id: "x", kind: "sleep", value: 420, unit: "min", start: "2026-11-04T23:00:00Z", end: "2026-11-05T06:00:00Z" }, "p", Date.parse("2026-11-06T00:00:00Z"));
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.reading.tzOffsetMinutes, null);
  assert.ok(dailySignals([r.reading], "Asia/Tokyo").has("2026-11-05"));
  assert.ok(dailySignals([r.reading], "Pacific/Pago_Pago").has("2026-11-04"));
  const bad = validateReading({ id: "y", kind: "sleep", value: 420, unit: "min", start: "2026-11-04T23:00:00Z", end: "2026-11-05T06:00:00Z", timeZone: "Mars/Base" }, "p", Date.parse("2026-11-06T00:00:00Z"));
  assert.ok(!bad.ok);
  const mismatch = validateReading({ id: "z", kind: "sleep", value: 420, unit: "min", start: "2026-11-04T23:00:00Z", end: "2026-11-05T06:00:00Z", timeZone: "Africa/Cairo", tzOffsetMinutes: 0 }, "p", Date.parse("2026-11-06T00:00:00Z"));
  assert.ok(!mismatch.ok);
});

// ---------- end to end through storage ----------
beforeEach(() => { useDatabase(); });

test("storage: check-ins keep their zone; quiet hours and 'today' follow the user's zone", async () => {
  const u = await register("tz@example.com", "correct horse battery");
  saveSettings(u.id, { timezone: "Africa/Cairo", onboarded: true, quietStart: 22, quietEnd: 8 });
  const ts = new Date(Date.now() - 3600e3).toISOString();
  const c = addCheckIn(u.id, { ts, tz: "Africa/Cairo", mood: 6, energy: 6, stress: 4, focus: null, sleepHours: null, sleepQuality: null, tags: [], note: null, mode: "everyday" });
  assert.equal(c.tz, "Africa/Cairo");
  // 23:00 in Cairo (quiet) vs the same instant for a New York user (18:00, not quiet).
  const late = new Date(zonedTimeToUtc(localDate(new Date(), "Africa/Cairo"), 23, 0, "Africa/Cairo"));
  const quietIds = snapshot(u.id, late).nudges.map((n) => n.id);
  assert.deepEqual(quietIds, [], "no nudges during the person's quiet hours");
  saveSettings(u.id, { timezone: "America/New_York" });
  assert.equal(getSettings(u.id).timezone, "America/New_York");
  assert.ok(snapshot(u.id, late).tz === "America/New_York");
});

test("settings API rejects fixed offsets and unknown zones", async () => {
  const path = await import("node:path");
  const { POST } = await import(path.join(__dirname, "..", "app/api/settings/route.ts"));
  const { createSession, SESSION_COOKIE } = await import("../lib/auth");
  const u = await register("tzapi@example.com", "correct horse battery");
  const t = createSession(u.id).token;
  const call = (body: unknown) => POST(new Request("http://calm.test/api/settings", { method: "POST", body: JSON.stringify(body), headers: { host: "calm.test", origin: "http://calm.test", "content-type": "application/json", cookie: `${SESSION_COOKIE}=${t}` } }));
  assert.equal((await call({ timezone: "+02:00" })).status, 400);
  assert.equal((await call({ timezone: "Mars/Phobos" })).status, 400);
  assert.equal((await call({ timezone: "europe/london" })).status, 200);
  assert.equal(getSettings(u.id).timezone, "Europe/London");
});
