/**
 * Theme checks: Light / Dark / System, switching without reload, no flash, persistence.
 *   E2E_URL=http://localhost:3100 node e2e/theme.e2e.cjs
 */
const { chromium, devices } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const U = process.env.E2E_URL || "http://localhost:3100";
const OUT = process.env.E2E_OUT || path.join(require("node:os").tmpdir(), "calm-theme");
fs.mkdirSync(OUT, { recursive: true });
const ORIGINAL = { bg: "rgb(246, 244, 239)", surface: "rgb(255, 253, 249)", accent: "rgb(63, 125, 110)", ink: "rgb(35, 48, 44)" };
const DARK_BG = "rgb(17, 23, 22)";

const results = [];
async function check(name, fn) {
  try { await fn(); results.push(true); console.log("  ✓", name); }
  catch (e) { results.push(false); console.log("  ✗", name, "\n     ", e.message.split("\n")[0]); }
}
const bodyBg = (p) => p.evaluate(() => getComputedStyle(document.body).backgroundColor);
const attr = (p) => p.evaluate(() => document.documentElement.getAttribute("data-theme"));

(async () => {
  const browser = await chromium.launch();
  const email = `theme-${Date.now()}@example.com`;
  console.log("Calm theme e2e against", U);

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: "light" });
  const p = await ctx.newPage();
  const errors = []; p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(U + "/login?mode=register");
  await p.getByLabel("Email").fill(email);
  await p.getByLabel(/Password/).fill("correct horse battery");
  await p.getByRole("button", { name: "Create account" }).click();
  await p.getByText("Welcome to Calm").waitFor();
  await p.getByRole("button", { name: "Start with my first check-in" }).click();
  await p.waitForURL("**/check-in");
  await p.getByRole("button", { name: "Save check-in" }).click();
  await p.getByText("Thanks — saved").waitFor();

  await check("System (default) on a light device renders the exact original palette", async () => {
    await p.goto(U + "/");
    assert.equal(await attr(p), null);
    const c = await p.evaluate(() => {
      const probe = (v) => { const el = document.createElement("div"); el.style.color = `var(${v})`; document.body.append(el); const c = getComputedStyle(el).color; el.remove(); return c; };
      return { bg: getComputedStyle(document.body).backgroundColor, surface: probe("--surface"), accent: probe("--accent"), ink: probe("--ink") };
    });
    assert.deepEqual(c, ORIGINAL);
  });

  await check("System follows the device: switching the OS to dark changes the theme live", async () => {
    await p.emulateMedia({ colorScheme: "dark" });
    assert.equal(await bodyBg(p), DARK_BG);
    await p.emulateMedia({ colorScheme: "light" });
    assert.equal(await bodyBg(p), ORIGINAL.bg);
  });

  await check("choosing Dark applies instantly, without a reload", async () => {
    await p.goto(U + "/settings");
    await p.evaluate(() => { window.__noReload = true; });
    await p.getByRole("radio", { name: /Dark/ }).check();
    await p.waitForTimeout(500);
    assert.equal(await attr(p), "dark");
    assert.equal(await bodyBg(p), DARK_BG);
    assert.equal(await p.evaluate(() => window.__noReload), true, "page was reloaded");
  });

  await check("Dark persists after refresh and is server-rendered (no flash of light)", async () => {
    const html = await (await p.request.get(U + "/settings")).text();
    assert.match(html, /<html[^>]*data-theme="dark"/);
    await p.reload();
    assert.equal(await attr(p), "dark");
  });

  await check("Dark overrides a light device; Light overrides a dark device", async () => {
    await p.emulateMedia({ colorScheme: "light" });
    assert.equal(await bodyBg(p), DARK_BG);
    await p.getByRole("radio", { name: /Light/ }).check();
    await p.emulateMedia({ colorScheme: "dark" });
    await p.waitForTimeout(500);
    assert.equal(await attr(p), "light");
    assert.equal(await bodyBg(p), ORIGINAL.bg);
    await p.getByRole("radio", { name: /Dark/ }).check();
    await p.waitForTimeout(500);
  });

  await check("the choice follows the account: sign out, sign in on a fresh device", async () => {
    await p.getByRole("button", { name: "Sign out" }).click();
    await p.waitForURL("**/login");
    assert.equal(await attr(p), "dark", "this device remembers the choice when signed out");
    const fresh = await browser.newContext({ colorScheme: "light" });
    const q = await fresh.newPage();
    await q.goto(U + "/login");
    assert.equal(await attr(q), null, "a fresh device starts on System");
    await q.getByLabel("Email").fill(email);
    await q.getByLabel(/Password/).fill("correct horse battery");
    await q.getByRole("button", { name: "Sign in" }).click();
    await q.waitForURL(U + "/");
    assert.equal(await attr(q), "dark");
    assert.equal(await bodyBg(q), DARK_BG);
    await fresh.close();
  });

  await check("System can be chosen again and removes the override", async () => {
    await p.getByLabel("Email").fill(email);
    await p.getByLabel(/Password/).fill("correct horse battery");
    await p.getByRole("button", { name: "Sign in" }).click();
    await p.waitForURL(U + "/");
    await p.goto(U + "/settings");
    await p.getByRole("radio", { name: /System/ }).check();
    await p.waitForTimeout(500);
    assert.equal(await attr(p), null);
    await p.reload();
    assert.equal(await attr(p), null);
  });

  await check("reduced motion: theme change is instant (no cross-fade class)", async () => {
    const rm = await browser.newContext({ reducedMotion: "reduce", storageState: await ctx.storageState() });
    const r = await rm.newPage();
    await r.goto(U + "/settings");
    await r.getByRole("radio", { name: /Dark/ }).check();
    assert.equal(await r.evaluate(() => document.documentElement.classList.contains("theme-switching")), false);
    await r.getByRole("radio", { name: /System/ }).check();
    await rm.close();
  });

  // Screenshots: every page, both themes, phone + desktop. Also checks no page errors / overflow.
  const pages = ["/", "/check-in", "/support", "/support/breath-box", "/patterns", "/memory", "/lab", "/companion", "/circle", "/settings", "/setup/devices"];
  for (const theme of ["light", "dark"]) {
    for (const [label, opts] of [["mobile", devices["iPhone 13"]], ["desktop", { viewport: { width: 1280, height: 900 } }]]) {
      await check(`${theme} · ${label}: all pages render with no errors or overflow`, async () => {
        const c = await browser.newContext({ ...opts, colorScheme: theme, storageState: await ctx.storageState() });
        const pg = await c.newPage();
        const errs = []; pg.on("pageerror", (e) => errs.push(e.message));
        for (const route of pages) {
          await pg.goto(U + route); await pg.waitForLoadState("networkidle"); await pg.waitForTimeout(450);
          const over = await pg.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
          assert.ok(over <= 0, `${route} overflows`);
          await pg.screenshot({ path: path.join(OUT, `${theme}-${label}${route.replace(/\//g, "_")}.png`), fullPage: true });
        }
        await pg.goto(U + "/settings");
        await pg.getByRole("button", { name: "Delete all my wellbeing data…" }).click();
        await pg.getByRole("dialog").waitFor();
        await pg.waitForTimeout(500); // let the entrance animation settle
        await pg.screenshot({ path: path.join(OUT, `${theme}-${label}_dialog.png`) });
        await pg.keyboard.press("Escape");
        assert.deepEqual(errs, []);
        await c.close();
      });
    }
  }
  await check("no page errors during theme journeys", async () => assert.deepEqual(errors, []));
  await browser.close();
  const failed = results.filter((x) => !x).length;
  console.log(`\n${results.length - failed}/${results.length} theme checks passed. Screenshots: ${OUT}`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
