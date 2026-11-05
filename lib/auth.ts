import crypto from "node:crypto";
import { promisify } from "node:util";
import { db, type UserId } from "./db";

/**
 * Authentication & sessions, built on node:crypto only (no extra dependencies).
 *
 * - Passwords: scrypt (N=2^15, r=8, p=1), 16-byte random salt, constant-time compare.
 * - Sessions: 32 random bytes as an opaque cookie token. Only its SHA-256 is stored,
 *   so a database leak does not yield usable sessions. 30-day absolute lifetime,
 *   14-day idle timeout, a new token on every login, all revoked on account deletion.
 * - Login throttling: failed attempts are counted per email and per client address.
 * - No server secret is required, so there is nothing to leak from source or env.
 */

const scrypt = promisify(crypto.scrypt) as (pw: crypto.BinaryLike, salt: crypto.BinaryLike, keylen: number, opts: crypto.ScryptOptions) => Promise<Buffer>;
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEYLEN = 32;

export const SESSION_COOKIE = "calm_session";
export const SESSION_DAYS = 30;
const IDLE_DAYS = 14;
const DEMO_HOURS = 24;
export const PASSWORD_MIN = 10;
const PASSWORD_MAX = 200;

const LIMITS = { email: { max: 5, minutes: 15 }, ip: { max: 30, minutes: 15 }, register: { max: 10, minutes: 60 } };

export class AuthError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export interface User { id: UserId; email: string | null; isDemo: boolean; createdAt: string }

// ---------- passwords ----------
export async function hashPassword(pw: string) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(pw.normalize("NFKC"), salt, KEYLEN, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(pw: string, stored: string) {
  const [alg, N, r, p, saltB64, keyB64] = stored.split("$");
  if (alg !== "scrypt" || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, "base64");
  const got = await scrypt(pw.normalize("NFKC"), Buffer.from(saltB64, "base64"), expected.length,
    { N: Number(N), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem });
  return got.length === expected.length && crypto.timingSafeEqual(got, expected);
}

// Used when the email doesn't exist, so response time doesn't reveal which accounts exist.
let dummyHash: Promise<string> | null = null;
const getDummy = () => (dummyHash ??= hashPassword(crypto.randomBytes(16).toString("hex")));

export function normalizeEmail(e: unknown) {
  if (typeof e !== "string") throw new AuthError("Enter a valid email address.");
  const email = e.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AuthError("Enter a valid email address.");
  return email;
}

export function checkPasswordPolicy(pw: unknown): string {
  if (typeof pw !== "string" || pw.length < PASSWORD_MIN) throw new AuthError(`Use at least ${PASSWORD_MIN} characters.`);
  if (pw.length > PASSWORD_MAX) throw new AuthError("That password is too long.");
  return pw;
}

// ---------- throttling ----------
function recentAttempts(key: string, minutes: number) {
  const since = new Date(Date.now() - minutes * 60e3).toISOString();
  return (db().prepare("SELECT COUNT(*) AS n FROM login_attempts WHERE key = ? AND ts >= ?").get(key, since) as { n: number }).n;
}
function recordAttempt(key: string) {
  db().prepare("INSERT INTO login_attempts (key, ts) VALUES (?, ?)").run(key, new Date().toISOString());
}
function pruneAttempts() {
  db().prepare("DELETE FROM login_attempts WHERE ts < ?").run(new Date(Date.now() - 24 * 3600e3).toISOString());
}

// ---------- users ----------
type UserRow = { id: number; email: string | null; password_hash: string | null; is_demo: number; created_at: string };
const toUser = (r: UserRow): User => ({ id: r.id, email: r.email, isDemo: !!r.is_demo, createdAt: r.created_at });

export async function register(emailIn: unknown, pwIn: unknown, client = "unknown"): Promise<User> {
  if (client !== "unknown" && client !== "direct") {
    const rk = `register:${client}`;
    if (recentAttempts(rk, LIMITS.register.minutes) >= LIMITS.register.max) throw new AuthError("Too many sign-ups from here. Try again later.", 429);
    recordAttempt(rk);
  }
  const email = normalizeEmail(emailIn);
  const pw = checkPasswordPolicy(pwIn);
  const hash = await hashPassword(pw);
  try {
    const info = db().prepare("INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)").run(email, hash, new Date().toISOString());
    return toUser(db().prepare("SELECT * FROM users WHERE id = ?").get(info.lastInsertRowid) as UserRow);
  } catch (e) {
    if (e instanceof Error && /UNIQUE/.test(e.message)) throw new AuthError("An account with that email already exists. Try signing in.", 409);
    throw e;
  }
}

export async function login(emailIn: unknown, pwIn: unknown, client = "unknown"): Promise<User> {
  const email = typeof emailIn === "string" ? emailIn.trim().toLowerCase() : "";
  const pw = typeof pwIn === "string" ? pwIn.slice(0, PASSWORD_MAX) : "";
  const ek = `login:${email}`, ik = `ip:${client}`;
  // The per-address bucket only applies when the real client address is known (CALM_TRUST_PROXY);
  // otherwise every caller shares one key and a single attacker could lock everyone out.
  const ipKnown = client !== "unknown" && client !== "direct";
  if (recentAttempts(ek, LIMITS.email.minutes) >= LIMITS.email.max || (ipKnown && recentAttempts(ik, LIMITS.ip.minutes) >= LIMITS.ip.max)) {
    throw new AuthError("Too many attempts. Wait 15 minutes and try again.", 429);
  }
  const row = email ? (db().prepare("SELECT * FROM users WHERE email = ?").get(email) as UserRow | undefined) : undefined;
  const ok = row?.password_hash ? await verifyPassword(pw, row.password_hash) : (await verifyPassword(pw, await getDummy()), false);
  if (!ok || !row) {
    recordAttempt(ek); if (ipKnown) recordAttempt(ik);
    throw new AuthError("Email or password is incorrect.", 401);
  }
  db().prepare("DELETE FROM login_attempts WHERE key = ?").run(ek);
  pruneAttempts();
  return toUser(row);
}

export function getUser(id: UserId): User | null {
  const r = db().prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
  return r ? toUser(r) : null;
}

export async function changePassword(uid: UserId, current: unknown, next: unknown, keepToken?: string) {
  const row = db().prepare("SELECT * FROM users WHERE id = ?").get(uid) as UserRow | undefined;
  if (!row?.password_hash || typeof current !== "string" || !(await verifyPassword(current, row.password_hash))) {
    throw new AuthError("Current password is incorrect.", 401);
  }
  const hash = await hashPassword(checkPasswordPolicy(next));
  db().prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, uid);
  // Sign out every other device.
  const keep = keepToken ? hashToken(keepToken) : "";
  db().prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?").run(uid, keep);
}

/** Permanently delete the account. ON DELETE CASCADE removes every owned row and session. */
export async function deleteAccount(uid: UserId, password: unknown) {
  const row = db().prepare("SELECT * FROM users WHERE id = ?").get(uid) as UserRow | undefined;
  if (!row) throw new AuthError("Account not found.", 404);
  if (!row.is_demo) {
    if (!row.password_hash || typeof password !== "string" || !(await verifyPassword(password, row.password_hash))) {
      throw new AuthError("Password is incorrect.", 401);
    }
  }
  db().prepare("DELETE FROM users WHERE id = ?").run(uid);
}

// ---------- demo accounts ----------
/** A throwaway account with no credentials. Demo data never touches real accounts. */
export function createDemoUser(): User {
  cleanupDemoUsers();
  const info = db().prepare("INSERT INTO users (email, password_hash, is_demo, created_at) VALUES (NULL, NULL, 1, ?)").run(new Date().toISOString());
  return getUser(Number(info.lastInsertRowid))!;
}
export function cleanupDemoUsers() {
  db().prepare("DELETE FROM users WHERE is_demo = 1 AND created_at < ?").run(new Date(Date.now() - 2 * DEMO_HOURS * 3600e3).toISOString());
}

// ---------- sessions ----------
export const hashToken = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

export function createSession(uid: UserId, demo = false) {
  const token = crypto.randomBytes(32).toString("base64url");
  const now = new Date();
  const expires = new Date(now.getTime() + (demo ? DEMO_HOURS * 3600e3 : SESSION_DAYS * 864e5));
  db().prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_seen_at) VALUES (?,?,?,?,?)")
    .run(hashToken(token), uid, now.toISOString(), expires.toISOString(), now.toISOString());
  return { token, expires };
}

/** Resolve a cookie token to a user, enforcing absolute and idle expiry. */
export function userForToken(token: string | undefined | null): User | null {
  if (!token || token.length > 100) return null;
  const h = hashToken(token);
  const s = db().prepare("SELECT user_id, expires_at, last_seen_at FROM sessions WHERE token_hash = ?").get(h) as
    { user_id: number; expires_at: string; last_seen_at: string } | undefined;
  if (!s) return null;
  const now = Date.now();
  if (Date.parse(s.expires_at) <= now || Date.parse(s.last_seen_at) <= now - IDLE_DAYS * 864e5) {
    db().prepare("DELETE FROM sessions WHERE token_hash = ?").run(h);
    return null;
  }
  if (Date.parse(s.last_seen_at) < now - 5 * 60e3) {
    db().prepare("UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?").run(new Date(now).toISOString(), h);
  }
  return getUser(s.user_id);
}

export function destroySession(token: string | undefined | null) {
  if (token) db().prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
}

// ---------- legacy data (from the single-user version) ----------
/** Operator-only: move data from the locked legacy owner to a registered account. */
export function claimLegacy(targetEmail: string) {
  const target = db().prepare("SELECT id FROM users WHERE email = ? AND is_demo = 0 AND is_legacy = 0").get(normalizeEmail(targetEmail)) as { id: number } | undefined;
  if (!target) throw new AuthError("No registered account with that email.");
  const legacy = db().prepare("SELECT id FROM users WHERE is_legacy = 1").get() as { id: number } | undefined;
  if (!legacy) throw new AuthError("There is no legacy data to claim.");
  db().transaction(() => {
    for (const t of ["checkins", "support_sessions", "memories", "circle", "companion_messages"]) {
      db().prepare(`UPDATE ${t} SET user_id = ? WHERE user_id = ?`).run(target.id, legacy.id);
    }
    // keyed tables: the target's own values win on conflict
    db().prepare("INSERT OR IGNORE INTO settings (user_id, key, value) SELECT ?, key, value FROM settings WHERE user_id = ?").run(target.id, legacy.id);
    db().prepare("INSERT OR IGNORE INTO insight_feedback (user_id, key, rating, ts) SELECT ?, key, rating, ts FROM insight_feedback WHERE user_id = ?").run(target.id, legacy.id);
    db().prepare("DELETE FROM users WHERE id = ?").run(legacy.id);
  })();
  return target.id;
}
