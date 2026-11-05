import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { migrate } from "./migrations";
import type {
  CheckIn, CircleContact, CompanionMessage, Memory, MemoryKind, NewCheckIn,
  Settings, SupportSession, ToolId,
} from "./types";

/**
 * Data access. ISOLATION RULE: every function that touches personal data takes
 * the owning user's id first, and every SQL statement — reads, updates AND
 * deletes-by-id — is constrained by `user_id = ?`. Never add a query without it.
 */
export type UserId = number;

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

let _db: Database.Database | null = null;

function open(file: string) {
  const d = new Database(file);
  d.pragma("journal_mode = WAL");
  d.pragma("foreign_keys = ON");
  d.pragma("busy_timeout = 5000");
  migrate(d);
  return d;
}

export function db(): Database.Database {
  if (_db) return _db;
  const file = process.env.CALM_DB_PATH || path.join(process.cwd(), "data", "calm.db");
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  _db = open(file);
  return _db;
}

/** Test helper: swap in an isolated (usually in-memory) database. */
export function useDatabase(file = ":memory:") {
  _db?.close();
  _db = open(file);
  return _db;
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

export function listCheckIns(uid: UserId, sinceDays = 120): CheckIn[] {
  const since = new Date(Date.now() - sinceDays * 864e5).toISOString();
  return (db().prepare("SELECT * FROM checkins WHERE user_id = ? AND ts >= ? ORDER BY ts ASC").all(uid, since) as CheckInRow[]).map(toCheckIn);
}

export function addCheckIn(uid: UserId, c: NewCheckIn, source: CheckIn["source"] = "manual"): CheckIn {
  const ts = c.ts ?? new Date().toISOString();
  const tags = Array.from(new Set(c.tags.map(normalizeTag).filter(Boolean)));
  const info = db().prepare(
    `INSERT INTO checkins (user_id, ts, mood, energy, stress, focus, sleep_hours, sleep_quality, tags, note, mode, source)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(uid, ts, c.mood, c.energy, c.stress, c.focus, c.sleepHours, c.sleepQuality, JSON.stringify(tags), c.note, c.mode, source);
  return toCheckIn(db().prepare("SELECT * FROM checkins WHERE id = ? AND user_id = ?").get(info.lastInsertRowid, uid) as CheckInRow);
}

/** Returns true only if a row owned by `uid` was deleted. */
export function deleteCheckIn(uid: UserId, id: number) {
  return db().prepare("DELETE FROM checkins WHERE id = ? AND user_id = ?").run(id, uid).changes > 0;
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

export function listSessions(uid: UserId, sinceDays = 180): SupportSession[] {
  const since = new Date(Date.now() - sinceDays * 864e5).toISOString();
  return (db().prepare("SELECT * FROM support_sessions WHERE user_id = ? AND ts >= ? ORDER BY ts ASC").all(uid, since) as SessionRow[]).map(toSession);
}

export function addSession(uid: UserId, s: Omit<SupportSession, "id" | "ts"> & { ts?: string }): SupportSession {
  const info = db().prepare(
    `INSERT INTO support_sessions (user_id, ts, tool, pre_stress, post_stress, helpful, duration_sec, note) VALUES (?,?,?,?,?,?,?,?)`,
  ).run(uid, s.ts ?? new Date().toISOString(), s.tool, s.preStress, s.postStress, s.helpful, s.durationSec, s.note);
  return toSession(db().prepare("SELECT * FROM support_sessions WHERE id = ? AND user_id = ?").get(info.lastInsertRowid, uid) as SessionRow);
}

// ---------- memories ----------
type MemoryRow = { id: number; ts: string; kind: string; text: string; pinned: number; source: string };
const toMemory = (r: MemoryRow): Memory => ({
  id: r.id, ts: r.ts, kind: r.kind as MemoryKind, text: r.text, pinned: !!r.pinned, source: r.source as Memory["source"],
});

export function listMemories(uid: UserId): Memory[] {
  return (db().prepare("SELECT * FROM memories WHERE user_id = ? ORDER BY pinned DESC, ts DESC").all(uid) as MemoryRow[]).map(toMemory);
}
export function addMemory(uid: UserId, kind: MemoryKind, text: string, source: Memory["source"] = "user", ts?: string): Memory {
  const info = db().prepare("INSERT INTO memories (user_id, ts, kind, text, source) VALUES (?,?,?,?,?)")
    .run(uid, ts ?? new Date().toISOString(), kind, text.slice(0, 1000), source);
  return toMemory(db().prepare("SELECT * FROM memories WHERE id = ? AND user_id = ?").get(info.lastInsertRowid, uid) as MemoryRow);
}
export function updateMemory(uid: UserId, id: number, patch: { pinned?: boolean; text?: string }) {
  let changed = 0;
  if (patch.pinned !== undefined) changed += db().prepare("UPDATE memories SET pinned = ? WHERE id = ? AND user_id = ?").run(patch.pinned ? 1 : 0, id, uid).changes;
  if (patch.text !== undefined) changed += db().prepare("UPDATE memories SET text = ? WHERE id = ? AND user_id = ?").run(patch.text.slice(0, 1000), id, uid).changes;
  return changed > 0;
}
export function deleteMemory(uid: UserId, id: number) {
  return db().prepare("DELETE FROM memories WHERE id = ? AND user_id = ?").run(id, uid).changes > 0;
}

// ---------- circle ----------
export function listCircle(uid: UserId): CircleContact[] {
  return db().prepare("SELECT id, name, relation, contact, note FROM circle WHERE user_id = ? ORDER BY id").all(uid) as CircleContact[];
}
export function addCircle(uid: UserId, c: Omit<CircleContact, "id">) {
  db().prepare("INSERT INTO circle (user_id, name, relation, contact, note) VALUES (?,?,?,?,?)").run(uid, c.name, c.relation, c.contact, c.note);
}
export function deleteCircle(uid: UserId, id: number) {
  return db().prepare("DELETE FROM circle WHERE id = ? AND user_id = ?").run(id, uid).changes > 0;
}

// ---------- companion ----------
export function listCompanion(uid: UserId, limit = 60): CompanionMessage[] {
  const rows = db().prepare("SELECT id, ts, role, content, flagged FROM companion_messages WHERE user_id = ? ORDER BY id DESC LIMIT ?").all(uid, limit) as
    { id: number; ts: string; role: string; content: string; flagged: number }[];
  return rows.reverse().map((r) => ({ ...r, role: r.role as CompanionMessage["role"], flagged: !!r.flagged }));
}
export function addCompanion(uid: UserId, role: CompanionMessage["role"], content: string, flagged = false) {
  db().prepare("INSERT INTO companion_messages (user_id, ts, role, content, flagged) VALUES (?,?,?,?,?)")
    .run(uid, new Date().toISOString(), role, content, flagged ? 1 : 0);
}
export function clearCompanion(uid: UserId) {
  db().prepare("DELETE FROM companion_messages WHERE user_id = ?").run(uid);
}

// ---------- insight feedback ----------
export function insightFeedback(uid: UserId): Record<string, number> {
  const rows = db().prepare("SELECT key, rating FROM insight_feedback WHERE user_id = ?").all(uid) as { key: string; rating: number }[];
  return Object.fromEntries(rows.map((r) => [r.key, r.rating]));
}
export function setInsightFeedback(uid: UserId, key: string, rating: number) {
  db().prepare(`INSERT INTO insight_feedback (user_id, key, rating, ts) VALUES (?,?,?,?)
                ON CONFLICT(user_id, key) DO UPDATE SET rating = excluded.rating, ts = excluded.ts`)
    .run(uid, key, rating, new Date().toISOString());
}

// ---------- settings ----------
export function getSettings(uid: UserId): Settings {
  const rows = db().prepare("SELECT key, value FROM settings WHERE user_id = ?").all(uid) as { key: string; value: string }[];
  const stored = Object.fromEntries(rows.filter((r) => r.key in DEFAULT_SETTINGS).map((r) => [r.key, JSON.parse(r.value)]));
  return { ...DEFAULT_SETTINGS, ...stored };
}
export function saveSettings(uid: UserId, patch: Partial<Settings>) {
  const stmt = db().prepare(`INSERT INTO settings (user_id, key, value) VALUES (?, ?, ?)
                             ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value`);
  db().transaction((p: Partial<Settings>) => {
    for (const [k, v] of Object.entries(p)) if (k in DEFAULT_SETTINGS && v !== undefined) stmt.run(uid, k, JSON.stringify(v));
  })(patch);
}

// ---------- data rights ----------
const USER_TABLES = ["checkins", "support_sessions", "memories", "circle", "companion_messages", "insight_feedback", "settings"] as const;

/** Everything Calm holds about one user. Never includes credentials or session tokens. */
export function exportAll(uid: UserId) {
  const account = db().prepare("SELECT email, is_demo, created_at FROM users WHERE id = ?").get(uid) as
    { email: string | null; is_demo: number; created_at: string } | undefined;
  return {
    exportedAt: new Date().toISOString(),
    account: account ? { email: account.email, demo: !!account.is_demo, createdAt: account.created_at } : null,
    settings: getSettings(uid),
    checkins: listCheckIns(uid, 100000),
    supportSessions: listSessions(uid, 100000),
    memories: listMemories(uid),
    circle: listCircle(uid),
    companion: listCompanion(uid, 100000),
    insightFeedback: insightFeedback(uid),
  };
}

/** Delete all of one user's wellbeing data (the account itself remains). */
export function wipeUserData(uid: UserId, keepSettings = false) {
  db().transaction(() => {
    for (const t of USER_TABLES) {
      if (keepSettings && t === "settings") continue;
      db().prepare(`DELETE FROM ${t} WHERE user_id = ?`).run(uid);
    }
  })();
}

export function countUserRows(uid: UserId) {
  return Object.fromEntries(USER_TABLES.map((t) => [t, (db().prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE user_id = ?`).get(uid) as { n: number }).n]));
}
