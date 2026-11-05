# Security model

This is a **prototype**. The controls below are implemented and tested, but the app has **not** had an external security review or penetration test, and it isn't certified for health data (HIPAA, GDPR Art. 9 and similar). Don't treat it as production-ready for real users' health information until that work is done.

## Authentication & sessions — `lib/auth.ts`

- **Passwords:** scrypt (N=2¹⁵, r=8, p=1) with a 16-byte random salt per user and a constant-time comparison. Minimum 10 characters, no composition rules (in line with NIST 800-63B). Plaintext passwords are never stored or logged.
- **Sessions:** the cookie `calm_session` holds 32 random bytes. The database stores only the token's **SHA-256**, so a stolen database contains no usable sessions.
  - Cookie flags: `HttpOnly; SameSite=Lax; Path=/`, plus `Secure` when `NODE_ENV=production`.
  - Sessions expire 30 days after creation, or after 14 days without use. Demo sessions last 24 hours.
  - A fresh token is issued on every login, which prevents session fixation.
  - Logout deletes the session on the server.
  - Changing your password signs out your other devices. Deleting your account removes all your sessions.
- **No server secret** is needed, so there is no key to leak from source, logs or the environment.
- **Throttling:** 5 failed logins per email per 15 minutes. With `CALM_TRUST_PROXY=1` there's also a per-address limit (30 per 15 minutes) and a sign-up limit (10 per hour). Without a trusted proxy, the per-address limits are off; otherwise every client would share one bucket and a single attacker could lock everyone out.
- **No user enumeration at login:** an unknown email and a wrong password get the same message and take the same time (the server runs scrypt against a dummy hash).

## Authorization & isolation

- Every API handler is built with `route()` in `lib/http.ts`. Unless a route is explicitly public, the wrapper resolves the session before the handler runs.
- Every protected page calls `requireUser()` (`lib/session.ts`).
- **Data isolation:** every personal-data table has `user_id NOT NULL REFERENCES users(id) ON DELETE CASCADE`. Every function in `lib/db.ts` takes the owner id, and every statement filters on `user_id`, including updates and deletes by row id. That means guessing another user's `id` changes nothing.
- `tests/authz.test.ts` enforces this:
  - It scans `app/api/**/route.ts` and fails if a handler doesn't use `route()`, or if a route is public without being on the allow-list.
  - It scans every page for `requireUser()`.
  - It calls every protected handler without a session and expects `401`.
  - Acting as user B, it tries to read, update and delete user A's rows through every route, then checks A's data is byte-for-byte intact and nothing of A's appears in B's responses.

## Request safety

- **CSRF:** `SameSite=Lax` cookies, plus a same-origin check (`Origin` matched against `Host`) on every `POST/PUT/PATCH/DELETE`. A cross-site request is rejected with `403` even when the session is valid.
- **Caching:** every API response carries `Cache-Control: no-store`.
- **Headers:** `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy: same-origin`, and a restrictive `Permissions-Policy`. The `X-Powered-By` header is turned off.
- **Validation:** every input goes through typed validators (`lib/validate.ts`) with range and length limits. All SQL uses parameterized queries. The only interpolated identifiers are fixed table names from code.
- **Logging:** errors are logged as `name: message` only, never with request bodies, cookies, tokens or SDK error objects.

## Data rights

- **Export** (`GET /api/export`): everything Calm holds about the caller and nothing about anyone else. No password hashes or tokens (tested).
- **Delete my data** (`POST /api/reset`): wipes the caller's wellbeing data and keeps the account.
- **Delete account** (`DELETE /api/account`): requires the password again, then cascades every owned row and session. It's also CSRF-protected (tested).

## Demo data

Demo data exists only in separate **demo accounts**. These have no email or password, are created from the sign-in page, and are deleted after 48 hours. A real account can't load demo data (tested). This replaces the old behaviour, where loading the demo wiped the real user's data.

## Migrations

`lib/migrations.ts` runs versioned, transactional, forward-only migrations at startup and checks foreign keys after each table rebuild. Data from the old single-user version is assigned to a **locked legacy owner** that can't log in. It is never handed automatically to whoever registers first. An operator reassigns it explicitly with `npm run claim-legacy -- you@example.com`.

## Dependency findings (Nov 2026)

`next@14.2.35` had 1 critical and multiple high advisories, including App Router/Server Components DoS and cache poisoning. Upgraded to `next@15.5.29` (patched backport line) and React 19.2. The PostCSS copy bundled with Next is pinned to `^8.5.23` via `overrides`. `npm audit --omit=dev` now reports **0 vulnerabilities**.

## Known gaps

- No email verification or password reset, because there's no mail infrastructure. Losing a password means losing the account.
- No MFA.
- Sign-up returns "account exists", which reveals whether an email is registered. Login doesn't.
- Per-email throttling lets someone who knows an email lock that account out for 15 minutes. This is a deliberate trade-off.
- The SQLite database isn't encrypted at rest; use disk encryption. There's no backup or retention policy.
- There's no strict script `Content-Security-Policy` (Next's inline scripts would need nonces).
- The AI companion sends the user's messages, and an optional summary if enabled, to Anthropic. This is disclosed in Settings.
- Days are grouped in the **server's** time zone. That's wrong for users in other zones (see README).
- The app runs as one process with SQLite. Horizontal scaling would need a shared database and session store.
