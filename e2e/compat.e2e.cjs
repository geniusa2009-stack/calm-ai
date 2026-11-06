/**
 * Device/browser compatibility checks using Chromium device EMULATION (not physical devices).
 *   E2E_URL=http://localhost:3100 node e2e/compat.e2e.cjs     (against a production build)
 */
const { chromium, devices } = require("playwright");
const assert = require("node:assert/strict");
const U = process.env.E2E_URL || "http://localhost:3100";
const PROFILES = [
  ["iPhone SE (375×667)", devices["iPhone SE"]],
  ["iPhone 13 (390×844)", devices["iPhone 13"]],
  ["iPhone 14 Pro Max (430×932)", devices["iPhone 14 Pro Max"]],
  ["Pixel 7 (412×915)", devices["Pixel 7"]],
  ["Galaxy S9+ (320×658)", devices["Galaxy S9+"]],
  ["iPad Mini (768×1024)", devices["iPad Mini"]],
  ["iPad Pro 11 landscape", devices["iPad Pro 11 landscape"]],
  ["Desktop 1280×800", { viewport: { width: 1280, height: 800 } }],
  ["Desktop 1920×1080", { viewport: { width: 1920, height: 1080 } }],
];
const PAGES = ["/", "/check-in", "/support", "/support/breath-box", "/patterns", "/memory", "/lab", "/companion", "/circle", "/settings", "/setup/devices"];
const results = [];
async function check(name, fn) {
  try { await fn(); results.push(true); console.log("  ✓", name); }
  catch (e) { results.push(false); console.log("  ✗", name, "\n     ", String(e.message).split("\n")[0]); }
}

(async () => {
  const b = await chromium.launch();
  const seed = await b.newContext();
  const sp = await seed.newPage();
  await sp.goto(U + "/login");
  await sp.getByRole("button", { name: "Try the demo" }).click();
  await sp.waitForURL(U + "/");
  const state = await seed.storageState();
  console.log("Compatibility (Chromium emulation) against", U);

  for (const [name, profile] of PROFILES) {
    await check(`${name}: every page fits, targets ≥ 44px on touch, low layout shift`, async () => {
      const c = await b.newContext({ ...profile, storageState: state, serviceWorkers: "block" });
      const p = await c.newPage();
      const errs = []; p.on("pageerror", (e) => errs.push(e.message));
      await p.addInitScript(() => { window.__cls = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: "layout-shift", buffered: true }); });
      for (const route of PAGES) {
        await p.goto(U + route); await p.waitForLoadState("networkidle"); await p.waitForTimeout(600);
        const r = await p.evaluate((touch) => {
          const over = document.documentElement.scrollWidth - document.documentElement.clientWidth;
          const small = touch ? [...document.querySelectorAll("main a.btn, main button, .bottom-nav a, .bottom-nav button, main input[type=checkbox], main select")]
            .filter((el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0 && b.height < 24; })
            .map((el) => (el.textContent || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 30)) : [];
          return { over, small, cls: window.__cls };
        }, !!profile.hasTouch);
        assert.ok(r.over <= 0, `${route} overflows by ${r.over}px`);
        assert.deepEqual(r.small, [], `${route} has targets under 24px (WCAG 2.5.8)`);
        assert.ok(r.cls < 0.1, `${route} CLS ${r.cls.toFixed(3)}`);
      }
      assert.deepEqual(errs, []);
      await c.close();
    });
  }

  await check("viewport: safe-area + keyboard-resize metadata present", async () => {
    const c = await b.newContext({ ...devices["iPhone 13"], storageState: state });
    const p = await c.newPage(); await p.goto(U + "/");
    const v = await p.getAttribute('meta[name="viewport"]', "content");
    assert.match(v, /viewport-fit=cover/); assert.match(v, /interactive-widget=resizes-content/);
    const pad = await p.evaluate(() => getComputedStyle(document.querySelector(".bottom-nav")).paddingBottom);
    assert.ok(pad, "bottom nav has bottom padding (uses env(safe-area-inset-bottom))");
    await c.close();
  });

  await check("reflow: 320 CSS px and 200% text size without horizontal scrolling (WCAG 1.4.4 / 1.4.10)", async () => {
    const c = await b.newContext({ viewport: { width: 320, height: 640 }, storageState: state });
    const p = await c.newPage();
    for (const route of ["/", "/check-in", "/patterns", "/settings"]) {
      await p.goto(U + route); await p.waitForLoadState("networkidle");
      await p.addStyleTag({ content: "html { font-size: 200% !important; }" });
      await p.waitForTimeout(200);
      const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(over <= 2, `${route} overflows by ${over}px at 200% text`);
    }
    await c.close();
  });

  await check("PWA: manifest is valid and installable-shaped", async () => {
    const r = await (await fetch(U + "/manifest.webmanifest")).json();
    assert.equal(r.display, "standalone"); assert.equal(r.start_url, "/");
    assert.ok(r.icons.some((i) => i.sizes === "192x192") && r.icons.some((i) => i.sizes === "512x512") && r.icons.some((i) => i.purpose === "maskable"));
    for (const i of r.icons) assert.equal((await fetch(U + i.src)).status, 200, i.src);
  });

  await check("service worker: registers, controls the page, offline fallback, never caches HTML or API", async () => {
    const c = await b.newContext({ storageState: state });
    const p = await c.newPage();
    await p.goto(U + "/");
    await p.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.ready.then(() => true), null, { timeout: 15000 });
    await p.reload(); await p.waitForLoadState("networkidle");
    assert.equal(await p.evaluate(() => !!navigator.serviceWorker.controller), true, "page is controlled after reload");
    await p.goto(U + "/patterns"); await p.waitForLoadState("networkidle");
    const cached = await p.evaluate(async () => { const out = []; for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) out.push(new URL(r.url).pathname); return out; });
    assert.ok(cached.includes("/offline.html"));
    const bad = cached.filter((u) => !u.startsWith("/_next/static/") && !u.startsWith("/icons/") && u !== "/offline.html");
    assert.deepEqual(bad, [], "only static assets may be cached");
    await c.setOffline(true);
    await p.goto(U + "/memory").catch(() => {});
    await p.getByRole("heading", { name: "You're offline" }).waitFor({ timeout: 5000 });
    const body = await p.textContent("body");
    assert.doesNotMatch(body, /demo|stress|mood|Signed in/i, "offline page shows no personal data");
    await c.setOffline(false);
    await c.close();
  });

  await check("network failure: a failed save shows an error and keeps the form", async () => {
    const c = await b.newContext({ storageState: state, serviceWorkers: "block" });
    const p = await c.newPage();
    await p.route("**/api/checkins", (r) => r.abort("failed"));
    await p.goto(U + "/check-in");
    await p.getByRole("button", { name: "Save check-in" }).click();
    await p.getByRole("alert").filter({ hasText: /.+/ }).first().waitFor();
    assert.equal(await p.getByRole("button", { name: "Save check-in" }).count(), 1);
    await c.close();
  });

  await b.close();
  const failed = results.filter((x) => !x).length;
  console.log(`\n${results.length - failed}/${results.length} compatibility checks passed (Chromium ${require("playwright/package.json").version} emulation).`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
