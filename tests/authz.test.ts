/**
 * Security tests: authentication, authorization coverage, cross-user isolation,
 * CSRF, sessions, throttling, export/deletion, demo separation, migrations.
 * Route handlers are invoked exactly as Next.js invokes them: with a Request.
 */
process.env.CALM_DB_PATH = ":memory:";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { useDatabase, db, countUserRows, listMemories, listCheckIns } from "../lib/db";
import { hashToken, register, createSession, userForToken, claimLegacy, login, SESSION_COOKIE } from "../lib/auth";
import { migrate, LATEST_VERSION, LEGACY_EMAIL } from "../lib/migrations";

const ROOT = path.join(__dirname, "..");
const ORIGIN = "http://calm.test";
const PUBLIC_ROUTES = new Set(["auth/login", "auth/register", "auth/logout", "auth/demo"]);

function req(method: string, url: string, opts: { token?: string | null; body?: unknown; origin?: string | null } = {}) {
  const headers: Record<string, string> = { host: "calm.test" };
  if (opts.origin !== null) headers.origin = opts.origin ?? ORIGIN;
  if (opts.token) headers.cookie = `${SESSION_COOKIE}=${opts.token}`;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  return new Request(ORIGIN + url, { method, headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined });
}

// Discover every API route file on disk, so a new route can't silently skip these tests.
function apiRoutes() {
  const base = path.join(ROOT, "app/api");
  const out: { name: string; file: string }[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === "route.ts") out.push({ name: path.relative(base, dir).split(path.sep).join("/"), file: p });
    }
  };
  walk(base);
  return out;
}
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
type Mod = Partial<Record<(typeof METHODS)[number], (r: Request) => Promise<Response>>>;
const load = async (name: string): Promise<Mod> => import(path.join(ROOT, "app/api", name, "route.ts"));

async function newUser(email: string) {
  const u = await register(email, "correct horse battery");
  return { user: u, token: createSession(u.id).token };
}

beforeEach(() => { useDatabase(); });

// ---------- coverage ----------
test("coverage: every API route handler is built with route(), and only allow-listed routes are public", () => {
  const routes = apiRoutes();
  assert.ok(routes.length >= 18, `found ${routes.length} routes`);
  for (const r of routes) {
    const src = fs.readFileSync(r.file, "utf8");
    const exported = [...src.matchAll(/export const (GET|POST|PUT|PATCH|DELETE)\s*=\s*([^\n]*)/g)];
    assert.ok(exported.length > 0, `${r.name} exports no handlers`);
    for (const [, method, rhs] of exported) {
      assert.match(rhs, /^route\(/, `${r.name} ${method} must use route()`);
      const isPublic = /^route\(\{\s*public:\s*true\s*\}/.test(rhs);
      assert.equal(isPublic, PUBLIC_ROUTES.has(r.name), `${r.name} ${method}: public=${isPublic} is not what the allow-list says`);
    }
    assert.ok(!/export (async )?function (GET|POST|PUT|PATCH|DELETE)/.test(src), `${r.name} has an unwrapped handler`);
  }
});

test("coverage: every page except /login requires a signed-in user", () => {
  const pages: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory() && e.name !== "api") walk(p);
      else if (e.name === "page.tsx") pages.push(p);
    }
  };
  walk(path.join(ROOT, "app"));
  assert.ok(pages.length >= 10);
  for (const p of pages) {
    const rel = path.relative(ROOT, p);
    if (rel === path.join("app", "login", "page.tsx")) continue;
    assert.match(fs.readFileSync(p, "utf8"), /await requireUser\(\)/, `${rel} must call requireUser()`);
  }
});

test("authentication: every protected handler returns 401 without a session", async () => {
  for (const r of apiRoutes()) {
    if (PUBLIC_ROUTES.has(r.name)) continue;
    const mod = await load(r.name);
    for (const m of METHODS) {
      const h = mod[m];
      if (!h) continue;
      const res = await h(req(m, `/api/${r.name}`, { body: m === "GET" ? undefined : {} }));
      assert.equal(res.status, 401, `${m} /api/${r.name} → ${res.status}`);
      assert.equal(res.headers.get("cache-control"), "no-store");
    }
  }
});

test("authentication: forged, malformed and expired tokens are rejected", async () => {
  const { user, token } = await newUser("a@example.com");
  assert.equal(userForToken(token)?.id, user.id);
  assert.equal(userForToken(token + "x"), null);
  assert.equal(userForToken("x".repeat(500)), null);
  assert.equal(userForToken(""), null);
  db().prepare("UPDATE sessions SET expires_at = ? WHERE token_hash = ?").run(new Date(Date.now() - 1000).toISOString(), hashToken(token));
  assert.equal(userForToken(token), null);
  const idle = createSession(user.id).token;
  db().prepare("UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?").run(new Date(Date.now() - 15 * 864e5).toISOString(), hashToken(idle));
  assert.equal(userForToken(idle), null, "idle timeout");
});

test("sessions: tokens are stored only as hashes; passwords only as scrypt", async () => {
  const { token } = await newUser("hash@example.com");
  const dump = JSON.stringify(db().prepare("SELECT * FROM sessions").all()) + JSON.stringify(db().prepare("SELECT * FROM users").all());
  assert.ok(!dump.includes(token), "raw token found in database");
  assert.ok(!dump.includes("correct horse battery"), "plaintext password found in database");
  assert.match(dump, /scrypt\$32768\$8\$1\$/);
});

// ---------- isolation ----------
test("isolation: user B cannot read, change or delete user A's data through any route", async () => {
  const A = await newUser("alice@example.com");
  const B = await newUser("bob@example.com");
  const call = async (name: string, m: (typeof METHODS)[number], token: string, url = `/api/${name}`, body?: unknown) =>
    (await load(name))[m]!(req(m, url, { token, body }));

  // A creates one of everything
  assert.equal((await call("checkins", "POST", A.token, undefined, { mood: 6, energy: 6, stress: 4, tags: ["secret-a"], note: "alice private note" })).status, 200);
  const mem = await (await call("memories", "POST", A.token, undefined, { kind: "note", text: "alice memory" })).json();
  await call("circle", "POST", A.token, undefined, { name: "Alice's friend", relation: "Friend" });
  await call("sessions", "POST", A.token, undefined, { tool: "grounding", preStress: 7, postStress: 3, helpful: 1 });
  await call("settings", "POST", A.token, undefined, { displayName: "Alice", mode: "study" });
  await call("insights", "POST", A.token, undefined, { key: "ctx:a", rating: 1 });
  await call("companion", "POST", A.token, undefined, { text: "alice says hi" });
  const aCheckinId = listCheckIns(A.user.id)[0].id;
  const aCircleId = (db().prepare("SELECT id FROM circle WHERE user_id = ?").get(A.user.id) as { id: number }).id;
  const before = countUserRows(A.user.id);

  // B attacks A's rows by id
  assert.equal((await call("memories", "PATCH", B.token, undefined, { id: mem.memory.id, text: "pwned", pinned: true })).status, 400);
  assert.equal((await call("memories", "DELETE", B.token, `/api/memories?id=${mem.memory.id}`)).status, 400);
  assert.equal((await call("checkins", "DELETE", B.token, `/api/checkins?id=${aCheckinId}`)).status, 400);
  assert.equal((await call("circle", "DELETE", B.token, `/api/circle?id=${aCircleId}`)).status, 400);
  await call("reset", "POST", B.token);
  await call("companion", "DELETE", B.token);

  // A's data is untouched
  assert.deepEqual(countUserRows(A.user.id), before);
  const target = listMemories(A.user.id).find((m) => m.id === mem.memory.id)!;
  assert.equal(target.text, "alice memory");
  assert.equal(target.pinned, false);

  // B's reads contain nothing of A's
  for (const [name, m] of [["export", "GET"], ["summary", "GET"], ["account", "GET"]] as const) {
    const text = await (await call(name, m, B.token)).text();
    for (const secret of ["alice", "Alice", "secret-a", "study"]) assert.ok(!text.includes(secret), `${name} leaked "${secret}" to B`);
  }
  const wi = await (await call("whatif", "POST", B.token, undefined, { sleepDelta: 1 })).json();
  assert.equal(wi.ready, false);
});

test("isolation: B's export contains only B; no credentials or session data in any export", async () => {
  const A = await newUser("a2@example.com");
  const exp = await (await (await load("export")).GET!(req("GET", "/api/export", { token: A.token }))).text();
  assert.ok(exp.includes("a2@example.com"));
  for (const bad of ["password", "scrypt", "token", A.token]) assert.ok(!exp.includes(bad), `export contains ${bad}`);
});

// ---------- CSRF ----------
test("CSRF: state-changing requests from another origin are rejected, even with a valid session", async () => {
  const A = await newUser("csrf@example.com");
  const mod = await load("memories");
  const evil = await mod.POST!(req("POST", "/api/memories", { token: A.token, origin: "https://evil.example", body: { kind: "note", text: "x" } }));
  assert.equal(evil.status, 403);
  const none = await mod.POST!(req("POST", "/api/memories", { token: A.token, origin: null, body: { kind: "note", text: "x" } }));
  assert.equal(none.status, 403);
  assert.equal(listMemories(A.user.id).length, 0);
  const del = await (await load("account")).DELETE!(req("DELETE", "/api/account", { token: A.token, origin: "https://evil.example", body: { password: "correct horse battery" } }));
  assert.equal(del.status, 403);
});

// ---------- login, logout, throttling ----------
test("login: sets an HttpOnly SameSite cookie; logout revokes the session server-side", async () => {
  await register("login@example.com", "correct horse battery");
  const res = await (await load("auth/login")).POST!(req("POST", "/api/auth/login", { body: { email: "LOGIN@example.com ", password: "correct horse battery" } }));
  assert.equal(res.status, 200);
  const cookie = res.headers.get("set-cookie")!;
  assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Lax/); assert.match(cookie, /Path=\//);
  const token = cookie.split(";")[0].split("=")[1];
  assert.ok(userForToken(token));
  await (await load("auth/logout")).POST!(req("POST", "/api/auth/logout", { token }));
  assert.equal(userForToken(token), null);
});

test("login: same error for unknown email and wrong password; throttled after 5 failures", async () => {
  await register("throttle@example.com", "correct horse battery");
  const h = (await load("auth/login")).POST!;
  const unknown = await (await h(req("POST", "/api/auth/login", { body: { email: "nobody@example.com", password: "whatever12345" } }))).json();
  const wrong = await h(req("POST", "/api/auth/login", { body: { email: "throttle@example.com", password: "wrong password 1" } }));
  assert.equal(wrong.status, 401);
  assert.equal((await wrong.json()).error, unknown.error);
  for (let i = 0; i < 4; i++) await h(req("POST", "/api/auth/login", { body: { email: "throttle@example.com", password: "nope nope nope" } }));
  const locked = await h(req("POST", "/api/auth/login", { body: { email: "throttle@example.com", password: "correct horse battery" } }));
  assert.equal(locked.status, 429, "correct password must still be refused while throttled");
});

test("throttling: failures against one account never lock out other accounts", async () => {
  await register("victim@example.com", "correct horse battery");
  await register("bystander@example.com", "correct horse battery");
  for (let i = 0; i < 40; i++) await login("victim@example.com", "wrong guess " + i, "direct").catch(() => {});
  assert.ok(await login("bystander@example.com", "correct horse battery", "direct"));
});

test("registration: enforces password length and rejects duplicates case-insensitively", async () => {
  const h = (await load("auth/register")).POST!;
  assert.equal((await h(req("POST", "/api/auth/register", { body: { email: "short@example.com", password: "short" } }))).status, 400);
  assert.equal((await h(req("POST", "/api/auth/register", { body: { email: "not-an-email", password: "long enough pw" } }))).status, 400);
  assert.equal((await h(req("POST", "/api/auth/register", { body: { email: "dup@example.com", password: "long enough pw" } }))).status, 200);
  assert.equal((await h(req("POST", "/api/auth/register", { body: { email: "DUP@example.com", password: "long enough pw" } }))).status, 409);
});

test("password change: requires the current password and signs out other sessions", async () => {
  const { user, token } = await newUser("pw@example.com");
  const other = createSession(user.id).token;
  const h = (await load("auth/password")).POST!;
  assert.equal((await h(req("POST", "/api/auth/password", { token, body: { current: "wrong", next: "new long password" } }))).status, 401);
  assert.equal((await h(req("POST", "/api/auth/password", { token, body: { current: "correct horse battery", next: "new long password" } }))).status, 200);
  assert.ok(userForToken(token), "current session kept");
  assert.equal(userForToken(other), null, "other session revoked");
  await assert.rejects(login("pw@example.com", "correct horse battery"));
  assert.ok(await login("pw@example.com", "new long password"));
});

// ---------- deletion ----------
test("account deletion: requires password, cascades every row and session, leaves others intact", async () => {
  const A = await newUser("del-a@example.com");
  const B = await newUser("del-b@example.com");
  for (const t of [A, B]) {
    await (await load("checkins")).POST!(req("POST", "/api/checkins", { token: t.token, body: { mood: 5, energy: 5, stress: 5 } }));
    await (await load("memories")).POST!(req("POST", "/api/memories", { token: t.token, body: { kind: "win", text: "w" } }));
  }
  const h = (await load("account")).DELETE!;
  assert.equal((await h(req("DELETE", "/api/account", { token: A.token, body: { password: "wrong" } }))).status, 401);
  const ok = await h(req("DELETE", "/api/account", { token: A.token, body: { password: "correct horse battery" } }));
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get("set-cookie")!, /Max-Age=0/);
  assert.ok(Object.values(countUserRows(A.user.id)).every((n) => n === 0));
  assert.equal((db().prepare("SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?").get(A.user.id) as { n: number }).n, 0);
  assert.equal(userForToken(A.token), null);
  assert.equal(listCheckIns(B.user.id).length, 1);
  assert.equal(listMemories(B.user.id).length, 1);
});

// ---------- demo separation ----------
test("demo: real accounts can't load demo data; demo accounts are separate and credential-less", async () => {
  const A = await newUser("real@example.com");
  const demoRes = await (await load("demo")).POST!(req("POST", "/api/demo", { token: A.token, body: {} }));
  assert.equal(demoRes.status, 400);
  assert.equal(listCheckIns(A.user.id).length, 0);

  const start = await (await load("auth/demo")).POST!(req("POST", "/api/auth/demo", { body: {} }));
  const dToken = start.headers.get("set-cookie")!.split(";")[0].split("=")[1];
  const demo = userForToken(dToken)!;
  assert.ok(demo.isDemo && demo.email === null);
  assert.ok(listCheckIns(demo.id).length > 20);
  assert.equal(listCheckIns(A.user.id).length, 0, "demo data must not appear in a real account");
  const row = db().prepare("SELECT password_hash FROM users WHERE id = ?").get(demo.id) as { password_hash: string | null };
  assert.equal(row.password_hash, null);
});

// ---------- migrations ----------
function legacyDb() {
  const d = new Database(":memory:");
  d.exec(`CREATE TABLE checkins (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, mood INTEGER NOT NULL, energy INTEGER NOT NULL,
            stress INTEGER NOT NULL, focus INTEGER, sleep_hours REAL, sleep_quality INTEGER, tags TEXT NOT NULL DEFAULT '[]', note TEXT,
            mode TEXT NOT NULL DEFAULT 'everyday', source TEXT NOT NULL DEFAULT 'manual');
          CREATE TABLE support_sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, tool TEXT NOT NULL, pre_stress INTEGER NOT NULL, post_stress INTEGER, helpful INTEGER, duration_sec INTEGER NOT NULL DEFAULT 0, note TEXT);
          CREATE TABLE memories (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, kind TEXT NOT NULL, text TEXT NOT NULL, pinned INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL DEFAULT 'user');
          CREATE TABLE circle (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, relation TEXT NOT NULL, contact TEXT, note TEXT);
          CREATE TABLE companion_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, flagged INTEGER NOT NULL DEFAULT 0);
          CREATE TABLE insight_feedback (key TEXT PRIMARY KEY, rating INTEGER NOT NULL, ts TEXT NOT NULL);
          CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
          INSERT INTO checkins (ts, mood, energy, stress, tags) VALUES ('2026-10-01T09:00:00Z', 6, 6, 4, '["work"]');
          INSERT INTO memories (ts, kind, text) VALUES ('2026-10-01T09:00:00Z', 'win', 'legacy win');
          INSERT INTO settings (key, value) VALUES ('mode', '"study"');`);
  d.pragma("foreign_keys = ON");
  return d;
}

test("migration: a pre-auth database is upgraded in place; data goes to a locked legacy owner", async () => {
  const d = legacyDb();
  migrate(d);
  const versions = (d.prepare("SELECT version FROM schema_migrations ORDER BY version").all() as { version: number }[]).map((r) => r.version);
  assert.deepEqual(versions, [1, LATEST_VERSION]);
  const legacy = d.prepare("SELECT * FROM users WHERE is_legacy = 1").get() as { id: number; password_hash: string | null; email: string };
  assert.equal(legacy.password_hash, null, "legacy owner can never log in");
  assert.equal(legacy.email, LEGACY_EMAIL);
  assert.equal((d.prepare("SELECT COUNT(*) AS n FROM checkins WHERE user_id = ?").get(legacy.id) as { n: number }).n, 1);
  for (const t of ["checkins", "memories", "settings", "circle", "support_sessions", "companion_messages", "insight_feedback"]) {
    const cols = (d.prepare(`PRAGMA table_info(${t})`).all() as { name: string; notnull: number }[]);
    assert.ok(cols.some((c) => c.name === "user_id" && c.notnull === 1), `${t}.user_id NOT NULL`);
    const fks = d.prepare(`PRAGMA foreign_key_list(${t})`).all() as { table: string; on_delete: string }[];
    assert.ok(fks.some((f) => f.table === "users" && f.on_delete === "CASCADE"), `${t} cascades`);
  }
  migrate(d); // idempotent
  assert.equal((d.prepare("SELECT COUNT(*) AS n FROM schema_migrations").get() as { n: number }).n, 2);
  await assert.rejects(async () => { useDatabase(); await login(LEGACY_EMAIL, ""); });
});

test("migration: operator can hand legacy data to a registered account", async () => {
  const file = path.join(fs.mkdtempSync(path.join(require("node:os").tmpdir(), "calm-")), "legacy.db");
  const seed = legacyDb();
  await seed.backup(file);
  seed.close();
  useDatabase(file);
  const { user } = await newUser("owner@example.com");
  claimLegacy("owner@example.com");
  assert.equal(listCheckIns(user.id, 100000).length, 1);
  assert.equal(listMemories(user.id)[0].text, "legacy win");
  assert.equal(db().prepare("SELECT 1 FROM users WHERE is_legacy = 1").get(), undefined);
  assert.throws(() => claimLegacy("owner@example.com"), /no legacy data/);
});

test("migration: a fresh database gets the full schema and no legacy user", () => {
  const d = new Database(":memory:");
  d.pragma("foreign_keys = ON");
  migrate(d);
  assert.equal((d.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n, 0);
  assert.ok(d.prepare("SELECT 1 FROM sqlite_master WHERE name = 'idx_checkins_user_ts'").get());
});
