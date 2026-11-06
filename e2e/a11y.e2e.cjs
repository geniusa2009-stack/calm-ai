/**
 * Automated accessibility checks (axe-core, WCAG 2.0/2.1/2.2 A + AA rules) on every page,
 * light + dark, desktop + phone, plus heading/landmark structure and keyboard checks.
 * Automated checks catch roughly a third to a half of issues; they do not replace
 * screen-reader testing (see docs/accessibility-audit.md).
 *   E2E_URL=http://localhost:3100 node e2e/a11y.e2e.cjs
 */
const { chromium, devices } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const U = process.env.E2E_URL || "http://localhost:3100";
const AXE = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const PAGES = ["/", "/check-in", "/support", "/support/breath-box", "/patterns", "/memory", "/lab", "/companion", "/circle", "/settings", "/setup/devices"];
const OUT = process.env.E2E_OUT;

async function audit(page) {
  await page.addScriptTag({ content: AXE });
  return page.evaluate(async (tags) => {
    const r = await window.axe.run(document, { runOnly: { type: "tag", values: tags }, resultTypes: ["violations"] });
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 3).map((n) => `${n.target.join(" ")} — ${n.failureSummary?.split("\n")[1]?.trim() ?? ""}`), count: v.nodes.length }));
  }, TAGS);
}
async function structure(page) {
  return page.evaluate(() => {
    const hs = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].filter((h) => !h.closest("dialog:not([open])") && h.getClientRects().length);
    const levels = hs.map((h) => Number(h.tagName[1]));
    const problems = [];
    if (levels.filter((l) => l === 1).length !== 1) problems.push(`expected exactly one h1, found ${levels.filter((l) => l === 1).length}`);
    for (let i = 1; i < levels.length; i++) if (levels[i] > levels[i - 1] + 1) problems.push(`heading jumps h${levels[i - 1]}→h${levels[i]} at "${hs[i].textContent.trim().slice(0, 40)}"`);
    if (!document.querySelector("main")) problems.push("no <main> landmark");
    if (document.querySelectorAll("main").length > 1) problems.push("more than one <main>");
    if (!document.documentElement.lang) problems.push("missing lang");
    if (!/\S+ · Calm$/.test(document.title)) problems.push(`page title "${document.title}" does not identify the page (WCAG 2.4.2)`);
    return problems;
  });
}

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ reducedMotion: "reduce" }); // audit settled UI, not mid-animation frames
  const p = await ctx.newPage();
  // A demo account has data on every page (charts, radar, patterns), which exercises the most UI.
  await p.goto(U + "/login");
  const login = { violations: await audit(p), structure: await structure(p) };
  await p.getByRole("button", { name: "Try the demo" }).click();
  await p.waitForURL(U + "/");
  const state = await ctx.storageState();
  const report = { "/login (light, desktop)": login };
  let total = 0;
  for (const scheme of ["light", "dark"]) {
    for (const [label, opts] of [["desktop", { viewport: { width: 1280, height: 900 } }], ["mobile", devices["iPhone 13"]]]) {
      const c = await b.newContext({ ...opts, colorScheme: scheme, storageState: state, reducedMotion: "reduce" });
      const pg = await c.newPage();
      for (const route of PAGES) {
        await pg.goto(U + route); await pg.waitForLoadState("networkidle"); await pg.waitForTimeout(200);
        const key = `${route} (${scheme}, ${label})`;
        report[key] = { violations: await audit(pg), structure: await structure(pg) };
      }
      // Open dialogs are part of the UI too.
      await pg.goto(U + "/settings");
      await pg.getByRole("button", { name: "Delete all my wellbeing data…" }).click();
      await pg.getByRole("dialog").waitFor();
      report[`/settings dialog (${scheme}, ${label})`] = { violations: await audit(pg), structure: [] };
      await c.close();
    }
  }
  // Keyboard: skip link, visible focus, no trap across Today.
  const k = await b.newContext({ storageState: state });
  const kp = await k.newPage();
  await kp.goto(U + "/");
  await kp.keyboard.press("Tab");
  const first = await kp.evaluate(() => document.activeElement?.textContent?.trim());
  await kp.keyboard.press("Enter");
  const afterSkip = await kp.evaluate(() => document.activeElement?.id);
  const seen = new Set(); let invisible = 0, steps = 0;
  for (; steps < 80; steps++) {
    await kp.keyboard.press("Tab");
    const info = await kp.evaluate(() => { const el = document.activeElement; if (!el || el === document.body) return null; const s = getComputedStyle(el); return { key: el.outerHTML.slice(0, 80), outline: s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0, shadow: s.boxShadow !== "none" }; });
    if (!info) break;
    if (!info.outline && !info.shadow) invisible++;
    if (seen.has(info.key) && seen.size > 5) break; // wrapped around → no trap
    seen.add(info.key);
  }
  const keyboard = { firstTab: first, skipLinkTargetsMain: afterSkip === "main", focusablesVisited: seen.size, withoutVisibleFocus: invisible };
  await b.close();

  let structural = 0;
  for (const [k2, v] of Object.entries(report)) {
    total += v.violations.length; structural += v.structure.length;
    if (v.violations.length || v.structure.length) {
      console.log(`✗ ${k2}`);
      for (const x of v.violations) console.log(`    [${x.impact}] ${x.id} ×${x.count}: ${x.help}\n      ${x.nodes.join("\n      ")}`);
      for (const s of v.structure) console.log(`    [structure] ${s}`);
    }
  }
  console.log("keyboard:", JSON.stringify(keyboard));
  console.log(`\n${Object.keys(report).length} page states audited; ${total} axe violation groups; ${structural} structure issues.`);
  if (OUT) fs.writeFileSync(path.join(OUT, "a11y-report.json"), JSON.stringify({ report, keyboard }, null, 2));
  process.exit(total || structural || !keyboard.skipLinkTargetsMain || keyboard.withoutVisibleFocus ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
