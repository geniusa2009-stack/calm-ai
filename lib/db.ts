import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import type {
  CheckIn, CircleContact, CompanionMessage, Memory, MemoryKind, NewCheckIn,
  Settings, SupportSession, ToolId,
} from "./types";

const DEFAULT_SETTINGS: Settings = {
  mode: "everyday",
  onboarded: false,
  displayName: "",
  nudgesEnabled: true,
  quietStart: 22,
  quietEnd: 8,
  companionEnabled: true,
  companionUsesContext: true,
  region: "US",
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS checkins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  mood INTEGER NOT NULL CHECK (mood BETWEEN 1 AND 10),
  energy INTEGER NOT NULL CHECK (energy BETWEEN 1 AND 10),
  stress INTEGER NOT NULL CHECK (stress BETWEEN 1 AND 10),
  focus INTEGER CHECK (focus BETWEEN 1 AND 10),
  sleep_hours REAL CHECK (sleep_hours BETWEEN 0 AND 16),
  sleep_quality INTEGER CHECK (sleep_quality BETWEEN 1 AND 5),
  tags TEXT NOT NULL DEFAULT '[]',
  note TEXT,
  mode TEXT NOT NULL DEFAULT 'everyday',
  source TEXT NOT NULL DEFAULT 'manual'
);
CREATE INDEX IF NOT EXISTS idx_checkins_ts ON checkins(ts);
CREATE TABLE IF NOT EXISTS support_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  tool TEXT NOT NULL,
  pre_stress INTEGER NOT NULL,
  post_stress INTEGER,
  helpful INTEGER,
  duration_sec INTEGER NOT NULL DEFAULT 0,
  note TEXT
);
CREATE TABLE IF NOT EXISTS memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  kind TEXT NOT NULL,
  text TEXT NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'user'
);
CREATE TABLE IF NOT EXISTS circle (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  relation TEXT NOT NULL,
  contact TEXT,
  note TEXT
);
CREATE TABLE IF NOT EXISTS companion_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  flagged INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS insight_feedback (
  key TEXT PRIMARY KEY,
  rating INTEGER NOT NULL,
  ts TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

let _db: Database.Database | null = null;

export function db(): Database.Database {
  if (_db) return _db;
  const file = process.env.CALM_DB_PATH || path.join(process.cwd(), "data", "calm.db");
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  _db = new Database(file);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  _db.exec(SCHEMA);
  return _db;
}

/** Test helper: swap in an isolated database. */
export function useDatabase(instance: Database.Database) {
  instance.exec(SCHEMA);
  _db = instance;
}

// ---------- check-ins ----------
type CheckInRow = {
  id: number; ts: string; mood: number; energy: number; stress: number; focus: number | null;
  sleep_hours: number | null; sleep_quality: number | null; tags: string; note: string | null;
  mode: string; source: string;
};

const toCheckIn = (r: CheckInRow): CheckIn => ({
  id: r.id, ts: r.ts, mood: r.mood, energy: r.energy, stress: r.stress, focus: r.focus,
  sleepHours: r.sleep_hours, sleepQuality: r.sleep_quality, tags: JSON.parse(r.tags),
  note: r.note, mode: r.mode as CheckIn["mode"], source: r.source as CheckIn["source"],
});

export function listCheckIns(sinceDays = 120): CheckIn[] {
  const since = new Date(Date.now() - sinceDays * 864e5).toISOString();
  return (db().prepare("SELECT * FROM checkins WHERE ts >= ? ORDER BY ts ASC").all(since) as CheckInRow[]).map(toCheckIn);
}

export function addCheckIn(c: NewCheckIn, source: CheckIn["source"] = "manual"): CheckIn {
  const ts = c.ts ?? new Date().toISOString();
  const tags = Array.from(new Set(c.tags.map(normalizeTag).filter(Boolean)));
  const info = db().prepare(
    `INSERT INTO checkins (ts, mood, energy, stress, focus, sleep_hours, sleep_quality, tags, note, mode, source)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(ts, c.mood, c.energy, c.stress, c.focus, c.sleepHours, c.sleepQuality, JSON.stringify(tags), c.note, c.mode, source);
  return toCheckIn(db().prepare("SELECT * FROM checkins WHERE id = ?").get(info.lastInsertRowid) as CheckInRow);
}

export function deleteCheckIn(id: number) {
  db().prepare("DELETE FROM checkins WHERE id = ?").run(id);
}

export function normalizeTag(t: string) {
  return t.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 32);
}

// ---------- support sessions ----------
type SessionRow = {
  id: number; ts: string; tool: string; pre_stress: number; post_stress: number | null;
  helpful: number | null; duration_sec: number; note: string | null;
};
const toSession = (r: SessionRow): SupportSession => ({
  id: r.id, ts: r.ts, tool: r.tool as ToolId, preStress: r.pre_stress, postStress: r.post_stress,
  helpful: r.helpful as SupportSession["helpful"], durationSec: r.duration_sec, note: r.note,
});

export function listSessions(sinceDays = 180): SupportSession[] {
  const since = new Date(Date.now() - sinceDays * 864e5).toISOString();
  return (db().prepare("SELECT * FROM support_sessions WHERE ts >= ? ORDER BY ts ASC").all(since) as SessionRow[]).map(toSession);
}

export function addSession(s: Omit<SupportSession, "id" | "ts"> & { ts?: string }): SupportSession {
  const info = db().prepare(
    `INSERT INTO support_sessions (ts, tool, pre_stress, post_stress, helpful, duration_sec, note) VALUES (?,?,?,?,?,?,?)`,
  ).run(s.ts ?? new Date().toISOString(), s.tool, s.preStress, s.postStress, s.helpful, s.durationSec, s.note);
  return toSession(db().prepare("SELECT * FROM support_sessions WHERE id = ?").get(info.lastInsertRowid) as SessionRow);
}

// ---------- memories ----------
type MemoryRow = { id: number; ts: string; kind: string; text: string; pinned: number; source: string };
const toMemory = (r: MemoryRow): Memory => ({
  id: r.id, ts: r.ts, kind: r.kind as MemoryKind, text: r.text, pinned: !!r.pinned, source: r.source as Memory["source"],
});

export function listMemories(): Memory[] {
  return (db().prepare("SELECT * FROM memories ORDER BY pinned DESC, ts DESC").all() as MemoryRow[]).map(toMemory);
}
export function addMemory(kind: MemoryKind, text: string, source: Memory["source"] = "user", ts?: string): Memory {
  const info = db().prepare("INSERT INTO memories (ts, kind, text, source) VALUES (?,?,?,?)")
    .run(ts ?? new Date().toISOString(), kind, text.slice(0, 1000), source);
  return toMemory(db().prepare("SELECT * FROM memories WHERE id = ?").get(info.lastInsertRowid) as MemoryRow);
}
export function updateMemory(id: number, patch: { pinned?: boolean; text?: string }) {
  if (patch.pinned !== undefined) db().prepare("UPDATE memories SET pinned = ? WHERE id = ?").run(patch.pinned ? 1 : 0, id);
  if (patch.text !== undefined) db().prepare("UPDATE memories SET text = ? WHERE id = ?").run(patch.text.slice(0, 1000), id);
}
export function deleteMemory(id: number) {
  db().prepare("DELETE FROM memories WHERE id = ?").run(id);
}

// ---------- circle ----------
export function listCircle(): CircleContact[] {
  return db().prepare("SELECT * FROM circle ORDER BY id").all() as CircleContact[];
}
export function addCircle(c: Omit<CircleContact, "id">) {
  db().prepare("INSERT INTO circle (name, relation, contact, note) VALUES (?,?,?,?)").run(c.name, c.relation, c.contact, c.note);
}
export function deleteCircle(id: number) {
  db().prepare("DELETE FROM circle WHERE id = ?").run(id);
}

// ---------- companion ----------
export function listCompanion(limit = 60): CompanionMessage[] {
  const rows = db().prepare("SELECT * FROM companion_messages ORDER BY id DESC LIMIT ?").all(limit) as
    { id: number; ts: string; role: string; content: string; flagged: number }[];
  return rows.reverse().map((r) => ({ ...r, role: r.role as CompanionMessage["role"], flagged: !!r.flagged }));
}
export function addCompanion(role: CompanionMessage["role"], content: string, flagged = false) {
  db().prepare("INSERT INTO companion_messages (ts, role, content, flagged) VALUES (?,?,?,?)")
    .run(new Date().toISOString(), role, content, flagged ? 1 : 0);
}
export function clearCompanion() {
  db().prepare("DELETE FROM companion_messages").run();
}

// ---------- insight feedback ----------
export function insightFeedback(): Record<string, number> {
  const rows = db().prepare("SELECT key, rating FROM insight_feedback").all() as { key: string; rating: number }[];
  return Object.fromEntries(rows.map((r) => [r.key, r.rating]));
}
export function setInsightFeedback(key: string, rating: number) {
  db().prepare("INSERT INTO insight_feedback (key, rating, ts) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET rating = excluded.rating, ts = excluded.ts")
    .run(key, rating, new Date().toISOString());
}

// ---------- settings ----------
export function getSettings(): Settings {
  const rows = db().prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  const stored = Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value)]));
  return { ...DEFAULT_SETTINGS, ...stored };
}
export function saveSettings(patch: Partial<Settings>) {
  const stmt = db().prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  const tx = db().transaction((p: Partial<Settings>) => {
    for (const [k, v] of Object.entries(p)) if (k in DEFAULT_SETTINGS && v !== undefined) stmt.run(k, JSON.stringify(v));
  });
  tx(patch);
}

// ---------- data rights ----------
export function exportAll() {
  return {
    exportedAt: new Date().toISOString(),
    settings: getSettings(),
    checkins: listCheckIns(100000),
    supportSessions: listSessions(100000),
    memories: listMemories(),
    circle: listCircle(),
    companion: listCompanion(100000),
    insightFeedback: insightFeedback(),
  };
}

export function wipeAll(keepSettings = false) {
  const d = db();
  d.exec(`DELETE FROM checkins; DELETE FROM support_sessions; DELETE FROM memories; DELETE FROM circle;
          DELETE FROM companion_messages; DELETE FROM insight_feedback;`);
  if (!keepSettings) d.exec("DELETE FROM settings;");
}
