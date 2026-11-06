process.env.CALM_DB_PATH = ":memory:";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { useDatabase, getSettings } from "../lib/db";
import { register, createSession, SESSION_COOKIE } from "../lib/auth";
import { parseTheme, themeAttr, THEME_COOKIE } from "../lib/theme";

const ROOT = path.join(__dirname, "..");
const css = fs.readFileSync(path.join(ROOT, "app/globals.css"), "utf8");

/** The original light palette, verbatim from app/globals.css at commit 0b75295. */
const ORIGINAL_LIGHT: Record<string, string> = {
  "--bg": "#f6f4ef", "--surface": "#fffdf9", "--surface-2": "#efece4", "--ink": "#23302c", "--ink-2": "#5a6662",
  "--ink-3": "#8a938f", "--line": "#e2ddd2", "--accent": "#3f7d6e", "--accent-ink": "#ffffff", "--accent-soft": "#dcebe5",
  "--calm": "#5b9a87", "--stretch": "#c9a24a", "--strain": "#c2694f", "--low": "#7a86b8", "--bright": "#6aa66f",
  "--care-soft": "#f6e6dc", "--celebrate-soft": "#e3f0dc", "--info-soft": "#e6ecf3",
};

function block(selectorStart: string) {
  const i = css.indexOf(selectorStart);
  assert.ok(i >= 0, `missing ${selectorStart}`);
  const open = css.indexOf("{", i);
  let depth = 0;
  for (let k = open; k < css.length; k++) {
    if (css[k] === "{") depth++;
    if (css[k] === "}" && --depth === 0) return css.slice(open + 1, k);
  }
  throw new Error("unbalanced");
}
const decls = (b: string) => Object.fromEntries([...b.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));

test("light theme uses the original palette exactly", () => {
  const light = decls(block(":root {"));
  for (const [k, v] of Object.entries(ORIGINAL_LIGHT)) assert.equal(light[k]?.toLowerCase(), v, k);
});

test("tokens added after the original are derived from original colours, not new hues", () => {
  const light = decls(block(":root {"));
  for (const k of ["--bg-tint", "--surface-3", "--line-strong", "--accent-hover", "--accent-softer", "--warn-soft", "--focus", "--backdrop", "--text-faint", "--link", "--stretch-text", "--strain-text", "--danger-bg"]) {
    assert.ok(light[k], k);
    assert.doesNotMatch(light[k], /#[0-9a-f]{3,8}\b/i, `${k} must be derived via var()/color-mix, not a new hex`);
    assert.match(light[k], /var\(--/, k);
  }
});

test("dark theme: explicit choice and system preference share one identical token set", () => {
  const explicit = decls(block(':root[data-theme="dark"]'));
  const media = decls(block(':root:not([data-theme="light"])'));
  assert.deepEqual(media, explicit);
  for (const k of Object.keys(ORIGINAL_LIGHT)) assert.ok(explicit[k], `dark theme defines ${k}`);
});

test("no hardcoded colours outside the token blocks (so every component follows the theme)", () => {
  const withoutTokens = css
    .replace(block(":root {"), "")
    .replace(block(':root[data-theme="dark"]'), "")
    .replace(block("@media (prefers-color-scheme: dark)"), "");
  const literals = withoutTokens.match(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi) ?? [];
  assert.deepEqual(literals, []);
  for (const dir of ["app", "components"]) {
    const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(d, e.name)] : []);
    for (const f of walk(path.join(ROOT, dir))) {
      if (f.endsWith(path.join("app", "layout.tsx"))) continue; // browser-chrome meta theme-color only
      assert.doesNotMatch(fs.readFileSync(f, "utf8"), /#[0-9a-fA-F]{6}\b|rgba?\(\d/, path.relative(ROOT, f));
    }
  }
});

test("theme helpers: unknown values fall back to system; system renders no attribute", () => {
  assert.equal(parseTheme("dark"), "dark");
  assert.equal(parseTheme("purple"), "system");
  assert.equal(parseTheme(undefined), "system");
  assert.equal(themeAttr("system"), undefined);
  assert.equal(themeAttr("light"), "light");
});

// ---------- persistence ----------
const req = (url: string, body: unknown, cookie = "") => new Request("http://calm.test" + url, {
  method: "POST", body: JSON.stringify(body), headers: { host: "calm.test", origin: "http://calm.test", "content-type": "application/json", cookie },
});
beforeEach(() => { useDatabase(); });

test("theme choice is validated, saved per account, and isolated between users", async () => {
  const a = await register("theme-a@example.com", "correct horse battery");
  const b = await register("theme-b@example.com", "correct horse battery");
  const { POST } = await import(path.join(ROOT, "app/api/settings/route.ts"));
  const ta = createSession(a.id).token;
  assert.equal(getSettings(a.id).theme, "system");
  assert.equal((await POST(req("/api/settings", { theme: "neon" }, `${SESSION_COOKIE}=${ta}`))).status, 400);
  assert.equal((await POST(req("/api/settings", { theme: "dark" }, `${SESSION_COOKIE}=${ta}`))).status, 200);
  assert.equal(getSettings(a.id).theme, "dark");
  assert.equal(getSettings(b.id).theme, "system");
});

test("a new account adopts the theme this device was already using", async () => {
  const { POST } = await import(path.join(ROOT, "app/api/auth/register/route.ts"));
  const res = await POST(req("/api/auth/register", { email: "adopt@example.com", password: "correct horse battery" }, `${THEME_COOKIE}=dark`));
  assert.equal(res.status, 200);
  const token = res.headers.get("set-cookie")!.split(";")[0].split("=")[1];
  const { userForToken } = await import("../lib/auth");
  assert.equal(getSettings(userForToken(token)!.id).theme, "dark");
});
