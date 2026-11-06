/**
 * Browser checks for the UI, motion and device-permission flows.
 *
 *   npm run build && npm start -- -p 3100      (in another terminal, against a scratch DB)
 *   E2E_URL=http://localhost:3100 npm run e2e
 *
 * Uses the Playwright + Chromium available on the machine (not a project dependency).
 * Browser permission APIs are replaced with instrumented fakes *before any page script runs*,
 * so the tests can prove that nothing prompts on load and drive every outcome.
 */
const { chromium, devices } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const U = process.env.E2E_URL || "http://localhost:3100";
const OUT = process.env.E2E_OUT || path.join(require("node:os").tmpdir(), "calm-e2e");
fs.mkdirSync(OUT, { recursive: true });
const PAGES = ["/", "/check-in", "/support", "/support/breath-box", "/patterns", "/memory", "/lab", "/companion", "/circle", "/settings", "/setup/devices"];

/** Fake Notification / wakeLock / vibrate with call counters. `answer` is what the prompt returns. */
function instrument({ initial = "default", answer = "granted", unsupported = false }) {
  window.__calls = { request: 0, wake: 0, vibrate: 0, shown: 0 };
  if (unsupported) { try { delete window.Notification; } catch {} window.Notification = undefined; }
  else {
    // Persist the decision across page loads, as a real browser does (per origin).
    const K = "__e2e_perm", C = "__e2e_calls";
    const saved = JSON.parse(localStorage.getItem(C) || "null");
    if (saved) window.__calls = saved;
    const persist = () => localStorage.setItem(C, JSON.stringify(window.__calls));
    const get = () => localStorage.getItem(K) || initial;
    class FakeNotification { constructor() { window.__calls.shown++; persist(); } close() {} static get permission() { return get(); } static async requestPermission() { window.__calls.request++; persist(); if (answer !== "default") localStorage.setItem(K, answer); return answer; } }
    window.Notification = FakeNotification;
  }
  const bump = (k) => { window.__calls[k]++; try { localStorage.setItem("__e2e_calls", JSON.stringify(window.__calls)); } catch {} };
  const wl = { request: async () => { bump("wake"); return { release: async () => {}, addEventListener() {} }; } };
  try { Object.defineProperty(navigator, "wakeLock", { value: wl, configurable: true }); } catch {}
  navigator.vibrate = () => { bump("vibrate"); return true; };
}

let n = 0;
const results = [];
async function check(name, fn) {
  try { await fn(); results.push(["ok", name]); console.log("  ✓", name); }
  catch (e) { results.push(["FAIL", name, e.message]); console.log("  ✗", name, "\n     ", e.message.split("\n")[0]); }
}

async function newUser(browser, opts = {}, ctxOpts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...ctxOpts });
  await ctx.addInitScript(instrument, opts);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(U + "/login?mode=register");
  await page.getByLabel("Email").fill(`e2e-${Date.now()}-${n++}@example.com`);
  await page.getByLabel(/Password/).fill("correct horse battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByRole("heading", { name: "Welcome to Calm" }).waitFor();
  return { ctx, page, errors };
}
const calls = (page) => page.evaluate(() => window.__calls);

async function onboardAndCheckIn(page) {
  await page.getByRole("button", { name: "Start with my first check-in" }).click();
  await page.waitForURL("**/check-in");
  await page.getByRole("button", { name: "Save check-in" }).click();
  await page.getByText("Thanks — saved").waitFor();
}

(async () => {
  const browser = await chromium.launch();
  console.log("Calm UI e2e against", U);

  // ---------- 1. No permission request before explicit action ----------
  const A = await newUser(browser, { answer: "granted" });
  await check("onboarding → first check-in works", () => onboardAndCheckIn(A.page));
  await check("no permission prompt, wake lock or vibration on load of any page", async () => {
    for (const p of PAGES) { await A.page.goto(U + p); await A.page.waitForLoadState("networkidle"); }
    assert.deepEqual(await calls(A.page), { request: 0, wake: 0, vibrate: 0, shown: 0 });
  });
  await check("Today offers the optional setup without requesting anything", async () => {
    await A.page.goto(U + "/");
    await A.page.getByRole("region", { name: "Optional device setup" }).waitFor();
    assert.equal((await calls(A.page)).request, 0);
  });

  // ---------- 2. Granted path through the guided flow ----------
  await check("granted: prompt appears only after tapping Enable, result is shown", async () => {
    const p = A.page;
    await p.goto(U + "/setup/devices");
    await p.getByRole("button", { name: "Let's go" }).click();
    await p.getByRole("heading", { name: "Gentle reminders" }).waitFor();
    assert.equal((await calls(p)).request, 0, "no prompt on arriving at the step");
    await p.getByRole("button", { name: "Enable reminders" }).click();
    await p.getByText("Notifications are on").waitFor();
    assert.equal((await calls(p)).request, 1);
    await p.getByRole("button", { name: "Continue" }).click();
    await p.getByRole("heading", { name: "Keep the screen on during sessions" }).waitFor();
    assert.equal((await calls(p)).wake, 0, "no wake lock before Enable");
    await p.getByRole("button", { name: "Enable", exact: true }).click();
    await p.getByText("Screen will stay on during sessions").waitFor();
    await p.getByRole("button", { name: "Continue" }).click();
    await p.getByRole("button", { name: "Enable and try it" }).click();
    await p.getByText("Gentle taps are on").waitFor();
    assert.equal((await calls(p)).vibrate, 1);
    await p.getByRole("button", { name: "Continue" }).click();
    await p.getByRole("heading", { name: "Health and wearable data" }).waitFor();
    await p.getByRole("button", { name: "Continue" }).click();
    await p.getByRole("heading", { name: "You're set" }).waitFor();
    const summary = await p.locator(".summary-list").innerText();
    assert.match(summary, /Reminders\s+On/i); assert.match(summary, /Screen on during sessions\s+On/i);
  });
  await check("settings reflects granted state and offers a test notification", async () => {
    const p = A.page;
    await p.goto(U + "/settings#device");
    await p.getByText("Allowed in browser").waitFor();
    assert.equal(await p.getByRole("switch", { name: "Reminders" }).isChecked(), true);
    await p.getByRole("button", { name: "Send a test" }).click();
    await p.getByText("Sent", { exact: true }).waitFor();
    assert.equal((await calls(p)).shown, 1);
  });
  await check("sessions hold the wake lock only while running, and tap on phase changes", async () => {
    const p = A.page;
    await p.goto(U + "/support/breath-box");
    const before = await calls(p);
    await p.waitForTimeout(500);
    assert.equal((await calls(p)).wake, before.wake, "no wake lock before the session starts");
    await p.getByRole("button", { name: "Begin" }).click();
    await p.getByText("Screen will stay on until you finish.").waitFor();
    assert.equal((await calls(p)).wake, before.wake + 1);
    await p.waitForTimeout(4600); // first phase is 4s
    assert.ok((await calls(p)).vibrate > before.vibrate, "haptic cue at phase change");
    await p.getByRole("button", { name: "Finish early" }).click();
  });
  await check("core flow intact: a support session saves", async () => {
    const p = A.page;
    await p.getByRole("button", { name: "Save" }).click();
    await p.getByRole("link", { name: "Back to today" }).waitFor();
  });

  // ---------- 3. Denied ----------
  const D = await newUser(browser, { answer: "denied" });
  await onboardAndCheckIn(D.page);
  await check("denied: explains calmly, never re-prompts, app stays usable", async () => {
    const p = D.page;
    await p.goto(U + "/setup/devices");
    await p.getByRole("button", { name: "Let's go" }).click();
    await p.getByRole("button", { name: "Enable reminders" }).click();
    await p.getByText("Notifications stay off").waitFor();
    await p.getByText(/won't ask again/).waitFor();
    await p.goto(U + "/settings#device");
    await p.getByText("Blocked in browser").waitFor();
    assert.equal(await p.getByRole("switch", { name: "Reminders" }).isDisabled(), true);
    await p.goto(U + "/setup/devices?restart=1");
    await p.getByRole("button", { name: "Let's go" }).click();
    await p.getByText("Already blocked in this browser").waitFor();
    assert.equal(await p.getByRole("button", { name: "Enable reminders" }).count(), 0);
    assert.equal((await calls(p)).request, 1, "exactly one prompt ever");
    await p.goto(U + "/check-in");
    await p.getByRole("button", { name: "Save check-in" }).waitFor();
  });

  // ---------- 4. Dismissed ----------
  const X = await newUser(browser, { answer: "default" });
  await onboardAndCheckIn(X.page);
  await check("dismissed: treated as no decision; can try again later from Settings", async () => {
    const p = X.page;
    await p.goto(U + "/setup/devices");
    await p.getByRole("button", { name: "Let's go" }).click();
    await p.getByRole("button", { name: "Enable reminders" }).click();
    await p.getByText("No decision made").waitFor();
    await p.goto(U + "/settings#device");
    await p.getByText("Not asked yet").waitFor();
    assert.equal(await p.getByRole("switch", { name: "Reminders" }).isDisabled(), false);
  });

  // ---------- 5. Unsupported ----------
  const N = await newUser(browser, { unsupported: true });
  await onboardAndCheckIn(N.page);
  await check("unsupported: labelled clearly, no Enable button, setup continues", async () => {
    const p = N.page;
    await p.goto(U + "/setup/devices");
    await p.getByRole("button", { name: "Let's go" }).click();
    await p.getByText("Browser support: Not supported in this browser").waitFor();
    assert.equal(await p.getByRole("button", { name: "Enable reminders" }).count(), 0);
    await p.getByRole("button", { name: "Skip for now" }).click();
    await p.getByRole("heading", { name: "Keep the screen on during sessions" }).waitFor();
  });

  // ---------- 6. Skip, resume, revisit ----------
  const S = await newUser(browser, {});
  await onboardAndCheckIn(S.page);
  await check("resumable: progress survives a reload", async () => {
    const p = S.page;
    await p.goto(U + "/setup/devices");
    await p.getByRole("button", { name: "Let's go" }).click();
    await p.getByRole("button", { name: "Skip for now" }).click();
    await p.getByRole("heading", { name: "Keep the screen on during sessions" }).waitFor();
    await p.waitForTimeout(400);
    await p.goto(U + "/setup/devices");
    await p.getByText("Step 2 of 4").waitFor();
  });
  await check("skip: 'Skip setup' returns to Today and removes the invitation", async () => {
    const p = S.page;
    await p.getByRole("button", { name: "Skip setup" }).click();
    await p.waitForURL(U + "/");
    await p.getByText("Early Shift Radar").waitFor();
    assert.equal(await p.getByRole("region", { name: "Optional device setup" }).count(), 0);
  });
  await check("revisit: Settings links back into the flow from the start", async () => {
    const p = S.page;
    await p.goto(U + "/settings");
    await p.getByRole("link", { name: "Open guided setup" }).click();
    await p.getByRole("heading", { name: "A few optional extras" }).waitFor();
    assert.equal((await calls(p)).request, 0);
  });

  // ---------- 7. Dialog keyboard behaviour ----------
  await check("dialog: focus moves in, Escape closes, focus returns to opener; nothing deleted", async () => {
    const p = S.page;
    await p.goto(U + "/settings");
    const opener = p.getByRole("button", { name: "Delete all my wellbeing data…" });
    await opener.click();
    const dialog = p.getByRole("dialog", { name: "Delete all your wellbeing data?" });
    await dialog.waitFor();
    assert.ok(await p.evaluate(() => !!document.activeElement?.closest("dialog")), "focus inside dialog");
    await p.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    assert.equal(await p.evaluate(() => document.activeElement?.textContent), "Delete all my wellbeing data…");
    const data = await p.evaluate(() => fetch("/api/export").then((r) => r.json()));
    assert.equal(data.checkins.length, 1);
  });

  // ---------- 8. Reduced motion ----------
  await check("reduced motion: entrance animations collapse to ~1ms fades", async () => {
    const rm = await browser.newContext({ reducedMotion: "reduce" });
    const p = await rm.newPage();
    await p.goto(U + "/login");
    const st = await p.evaluate(() => { const el = document.querySelector(".stagger > *"); const s = getComputedStyle(el); return { d: s.animationDuration, n: s.animationName }; });
    assert.equal(st.n, "fade-in"); assert.ok(parseFloat(st.d) <= 0.002, st.d);
    const normal = await browser.newContext();
    const q = await normal.newPage();
    await q.goto(U + "/login");
    const nd = await q.evaluate(() => getComputedStyle(document.querySelector(".stagger > *")).animationDuration);
    assert.equal(nd, "0.42s");
    await rm.close(); await normal.close();
  });

  // ---------- 9. Auth still enforced ----------
  await check("auth: signed-out visitors are redirected and APIs refuse", async () => {
    const c = await browser.newContext(); const p = await c.newPage();
    await p.goto(U + "/settings"); assert.match(p.url(), /\/login$/);
    assert.equal(await p.evaluate(() => fetch("/api/export").then((r) => r.status)), 401);
    await c.close();
  });

  // ---------- 10. Responsive: every page at phone, tablet and desktop ----------
  const T = await newUser(browser, {}, {});
  await onboardAndCheckIn(T.page);
  for (const [label, opts] of [["mobile", devices["iPhone 13"]], ["tablet", { viewport: { width: 820, height: 1180 } }], ["desktop", { viewport: { width: 1280, height: 900 } }]]) {
    await check(`${label}: no horizontal overflow and no page errors on any page`, async () => {
      const ctx = await browser.newContext({ ...opts, storageState: await T.ctx.storageState() });
      await ctx.addInitScript(instrument, {});
      const p = await ctx.newPage();
      const errs = []; p.on("pageerror", (e) => errs.push(e.message));
      for (const route of PAGES) {
        await p.goto(U + route); await p.waitForLoadState("networkidle"); await p.waitForTimeout(450);
        const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        assert.ok(over <= 0, `${route} overflows by ${over}px`);
        await p.screenshot({ path: path.join(OUT, `${label}${route.replace(/\//g, "_") || "_"}.png`), fullPage: true });
      }
      assert.deepEqual(errs, []);
      await ctx.close();
    });
  }
  await check("mobile: every section reachable via More sheet; touch targets ≥ 44px", async () => {
    const ctx = await browser.newContext({ ...devices["iPhone 13"], storageState: await T.ctx.storageState() });
    const p = await ctx.newPage();
    await p.goto(U + "/");
    const small = await p.evaluate(() => [...document.querySelectorAll(".bottom-nav a, .bottom-nav button, main .btn:not(.small), main .chip")]
      .filter((el) => el.getBoundingClientRect().height > 0 && el.getBoundingClientRect().height < 36).map((el) => el.textContent.trim()));
    assert.deepEqual(small, []);
    const navH = await p.evaluate(() => Math.min(...[...document.querySelectorAll(".bottom-nav a, .bottom-nav button")].map((e) => e.getBoundingClientRect().height)));
    assert.ok(navH >= 44, `bottom nav targets ${navH}px`);
    await p.getByRole("button", { name: "More" }).click();
    const sheet = p.getByRole("dialog", { name: "More" });
    await sheet.waitFor();
    for (const l of ["Memory", "What-If Lab", "Companion", "Circle & help", "Settings"]) assert.equal(await sheet.getByRole("link", { name: l }).count(), 1, l);
    await p.screenshot({ path: path.join(OUT, "mobile_more-sheet.png") });
    await sheet.getByRole("link", { name: "Memory" }).click();
    await p.waitForURL("**/memory");
    await ctx.close();
  });

  const all = [A, D, X, N, S, T].flatMap((u) => u.errors);
  await check("no uncaught page errors across all journeys", async () => assert.deepEqual(all, []));
  await browser.close();
  const failed = results.filter((r) => r[0] === "FAIL");
  console.log(`\n${results.length - failed.length}/${results.length} checks passed. Screenshots: ${OUT}`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
