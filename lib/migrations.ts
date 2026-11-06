import type Database from "better-sqlite3";

/**
 * Versioned, forward-only schema migrations.
 *
 * Rules for adding one:
 *  - append a new entry with the next version; never edit a shipped migration
 *  - each migration runs in its own transaction and is recorded in schema_migrations
 *  - prefer additive changes; for column constraints SQLite can't ALTER, use the
 *    documented rebuild pattern (create new table, copy, drop, rename)
 */
export interface Migration { version: number; name: string; up: (db: Database.Database) => void; foreignKeysOff?: boolean }

/** v1: the original single-user schema (kept verbatim so old databases and fresh ones converge). */
const V1 = `
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
CREATE TABLE IF NOT EXISTS support_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, tool TEXT NOT NULL, pre_stress INTEGER NOT NULL,
  post_stress INTEGER, helpful INTEGER, duration_sec INTEGER NOT NULL DEFAULT 0, note TEXT
);
CREATE TABLE IF NOT EXISTS memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, kind TEXT NOT NULL, text TEXT NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL DEFAULT 'user'
);
CREATE TABLE IF NOT EXISTS circle (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, relation TEXT NOT NULL, contact TEXT, note TEXT);
CREATE TABLE IF NOT EXISTS companion_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, flagged INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS insight_feedback (key TEXT PRIMARY KEY, rating INTEGER NOT NULL, ts TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

/** Tables that become user-owned in v2, with their v2 column definitions. */
const OWNED: { table: string; cols: string; copy: string; extra?: string }[] = [
  {
    table: "checkins",
    cols: `id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      ts TEXT NOT NULL, mood INTEGER NOT NULL CHECK (mood BETWEEN 1 AND 10), energy INTEGER NOT NULL CHECK (energy BETWEEN 1 AND 10),
      stress INTEGER NOT NULL CHECK (stress BETWEEN 1 AND 10), focus INTEGER CHECK (focus BETWEEN 1 AND 10),
      sleep_hours REAL CHECK (sleep_hours BETWEEN 0 AND 16), sleep_quality INTEGER CHECK (sleep_quality BETWEEN 1 AND 5),
      tags TEXT NOT NULL DEFAULT '[]', note TEXT, mode TEXT NOT NULL DEFAULT 'everyday', source TEXT NOT NULL DEFAULT 'manual'`,
    copy: "id, ts, mood, energy, stress, focus, sleep_hours, sleep_quality, tags, note, mode, source",
    extra: "CREATE INDEX idx_checkins_user_ts ON checkins(user_id, ts);",
  },
  {
    table: "support_sessions",
    cols: `id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      ts TEXT NOT NULL, tool TEXT NOT NULL, pre_stress INTEGER NOT NULL, post_stress INTEGER, helpful INTEGER,
      duration_sec INTEGER NOT NULL DEFAULT 0, note TEXT`,
    copy: "id, ts, tool, pre_stress, post_stress, helpful, duration_sec, note",
    extra: "CREATE INDEX idx_sessions_user_ts ON support_sessions(user_id, ts);",
  },
  {
    table: "memories",
    cols: `id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      ts TEXT NOT NULL, kind TEXT NOT NULL, text TEXT NOT NULL, pinned INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL DEFAULT 'user'`,
    copy: "id, ts, kind, text, pinned, source",
    extra: "CREATE INDEX idx_memories_user ON memories(user_id);",
  },
  {
    table: "circle",
    cols: `id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL, relation TEXT NOT NULL, contact TEXT, note TEXT`,
    copy: "id, name, relation, contact, note",
    extra: "CREATE INDEX idx_circle_user ON circle(user_id);",
  },
  {
    table: "companion_messages",
    cols: `id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      ts TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, flagged INTEGER NOT NULL DEFAULT 0`,
    copy: "id, ts, role, content, flagged",
    extra: "CREATE INDEX idx_companion_user ON companion_messages(user_id, id);",
  },
  {
    table: "insight_feedback",
    cols: `user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, key TEXT NOT NULL, rating INTEGER NOT NULL, ts TEXT NOT NULL,
      PRIMARY KEY (user_id, key)`,
    copy: "key, rating, ts",
  },
  {
    table: "settings",
    cols: `user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY (user_id, key)`,
    copy: "key, value",
  },
];

export const LEGACY_EMAIL = "legacy-owner@localhost.invalid";

export const MIGRATIONS: Migration[] = [
  { version: 1, name: "single-user schema", up: (db) => db.exec(V1) },
  {
    version: 2,
    name: "multi-user: accounts, sessions, user-owned data",
    foreignKeysOff: true, // required by SQLite's table-rebuild pattern
    up: (db) => {
      db.exec(`
        CREATE TABLE users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT UNIQUE COLLATE NOCASE,
          password_hash TEXT,              -- NULL = cannot log in (demo or legacy owner)
          is_demo INTEGER NOT NULL DEFAULT 0,
          is_legacy INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL
        );
        CREATE TABLE sessions (
          token_hash TEXT PRIMARY KEY,     -- SHA-256 of the cookie token; the token itself is never stored
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          last_seen_at TEXT NOT NULL
        );
        CREATE INDEX idx_sessions_user ON sessions(user_id);
        CREATE TABLE login_attempts (key TEXT NOT NULL, ts TEXT NOT NULL);
        CREATE INDEX idx_login_attempts ON login_attempts(key, ts);
      `);

      // Pre-existing single-user data is kept, owned by a locked legacy account that
      // nobody can log into. An operator can reassign it with `npm run claim-legacy`.
      const hasData = OWNED.some((t) => (db.prepare(`SELECT COUNT(*) AS n FROM ${t.table}`).get() as { n: number }).n > 0);
      let legacyId: number | null = null;
      if (hasData) {
        legacyId = Number(db.prepare("INSERT INTO users (email, password_hash, is_legacy, created_at) VALUES (?, NULL, 1, ?)")
          .run(LEGACY_EMAIL, new Date().toISOString()).lastInsertRowid);
      }

      for (const t of OWNED) {
        db.exec(`CREATE TABLE ${t.table}__v2 (${t.cols});`);
        if (legacyId != null) {
          db.prepare(`INSERT INTO ${t.table}__v2 (${t.copy}, user_id) SELECT ${t.copy}, ? FROM ${t.table}`).run(legacyId);
        }
        db.exec(`DROP TABLE ${t.table}; ALTER TABLE ${t.table}__v2 RENAME TO ${t.table};`);
        if (t.extra) db.exec(t.extra);
      }
    },
  },
  {
    version: 3,
    name: "passive signals: provider-agnostic readings",
    up: (db) => {
      db.exec(`
        CREATE TABLE signal_readings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          provider TEXT NOT NULL,
          external_id TEXT NOT NULL,        -- source id, or a content hash; makes re-delivery idempotent
          kind TEXT NOT NULL,
          value REAL NOT NULL,              -- canonical unit (see lib/signals/types.ts)
          start_ts TEXT NOT NULL,
          end_ts TEXT NOT NULL,
          tz_offset_min INTEGER,
          received_at TEXT NOT NULL,
          UNIQUE (user_id, provider, external_id)
        );
        CREATE INDEX idx_signal_user_kind_end ON signal_readings(user_id, kind, end_ts);
        CREATE TABLE signal_connections (
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          provider TEXT NOT NULL,
          last_sync_at TEXT,
          last_report TEXT,
          PRIMARY KEY (user_id, provider)
        );
      `);
    },
  },
  {
    version: 4,
    name: "timezones: record the IANA zone of each check-in and support session",
    // Additive and nullable: existing rows keep NULL and are dated in the user's current zone.
    up: (db) => {
      db.exec("ALTER TABLE checkins ADD COLUMN tz TEXT;");
      db.exec("ALTER TABLE support_sessions ADD COLUMN tz TEXT;");
    },
  },
];

export function migrate(db: Database.Database) {
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)");
  const applied = new Set((db.prepare("SELECT version FROM schema_migrations").all() as { version: number }[]).map((r) => r.version));

  // Databases created before the migration runner existed already have the v1 schema.
  if (!applied.size) {
    const legacy = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='checkins'").get();
    if (legacy) {
      db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (1, ?, ?)").run(MIGRATIONS[0].name, new Date().toISOString());
      applied.add(1);
    }
  }

  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue;
    if (m.foreignKeysOff) db.pragma("foreign_keys = OFF");
    try {
      db.transaction(() => {
        m.up(db);
        if (m.foreignKeysOff) {
          const problems = db.pragma("foreign_key_check") as unknown[];
          if (problems.length) throw new Error(`Migration ${m.version} left ${problems.length} foreign key violations`);
        }
        db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)").run(m.version, m.name, new Date().toISOString());
      })();
    } finally {
      if (m.foreignKeysOff) db.pragma("foreign_keys = ON");
    }
  }
}

export const LATEST_VERSION = MIGRATIONS.at(-1)!.version;
