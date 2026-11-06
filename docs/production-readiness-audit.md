# Production readiness audit (Phase 0)

Audited at commit `5f1a22e` on `master` (in sync with `origin/master`, working tree clean). Everything below was verified by reading code and running commands; nothing comes from earlier reports.

## Verified architecture

| Area | Finding |
|---|---|
| Stack | Next.js 15.5.29 (App Router), React 19.2, TypeScript 5 strict, Node 22. Single process. |
| Data | SQLite (`better-sqlite3`). Versioned, transactional, forward-only migrations in `lib/migrations.ts`, at v3. |
| Auth | `lib/auth.ts`: scrypt passwords, SHA-256-hashed opaque session tokens, HttpOnly/SameSite=Lax/Secure cookies, login throttling. `route()` wrapper with an Origin check; `requireUser()` on pages; middleware returns a 307 when signed out. |
| Isolation | Every personal table has `user_id NOT NULL … ON DELETE CASCADE`, and every query is scoped. Enforced by `tests/authz.test.ts`. |
| Settings | Per-user key/value table, typed in `lib/types.ts`, validated in `app/api/settings/route.ts`. |
| Engine | Pure functions over `Day[]` (`lib/engine/*`). Check-in timestamps are stored as UTC ISO strings. |
| Notifications | `components/NotificationBridge.tsx` shows **local** notifications only while a tab is open. No service worker, no push, no server delivery. |
| Device permissions | `lib/device/capabilities.ts` with injectable env. Only explicit clicks prompt (tested). |
| Wearables | `lib/signals/*`: provider registry, validation, idempotent ingest, daily aggregation. Implemented: **file import** and a **demo provider** (demo accounts only). Oura, Fitbit, Garmin, Apple Health and Health Connect are registry entries only, with no code. |
| Import/export | `/api/signals/import` (JSON, 2 MB / 5,000 readings); `/api/export` (complete per-user JSON). |
| PWA | **None.** No `public/` folder, no manifest, no icons, no service worker. |
| Tests | `node:test` via `tsx`: 100 unit tests passing. Browser suites `e2e/ui.e2e.cjs` (21 checks) and `e2e/theme.e2e.cjs` (13 checks), using the machine's Playwright. |
| Lint | **No ESLint configured.** |
| Browsers available | **Chromium only** (`/opt/pw-browsers/chromium-1243`). No WebKit, no Firefox, and no physical devices or screen readers in this environment. |
| Deployment | No deployment configuration in the repo. `.env.example` lists `ANTHROPIC_API_KEY`, `CALM_COMPANION_MODEL`, `CALM_DB_PATH`. |

## Confirmed gaps

**Broken (critical): timezone.** Every calendar computation uses the **server's** local timezone:
- `lib/engine/days.ts` (`localDate`, `addDays`, `groupByDay`);
- the Pulse, radar, insights and what-if "today" calculations;
- weekday patterns (`getDay()`);
- quiet hours and evening tool ranking (`now.getHours()`);
- the Today greeting, date header and chart labels;
- demo seeding;
- the wearable fallback attribution.

`recovery.ts` also compares UTC date slices with local dates. To demonstrate it, the same two Cairo check-ins (23:30 on 5 Nov and 08:00 on 6 Nov) were grouped under three server timezones:

| Server timezone | Days produced |
|---|---|
| UTC | `2026-11-05(1) 2026-11-06(1)` |
| Asia/Tokyo | `2026-11-06(2)` |
| America/Los_Angeles | `2026-11-05(2)` |

The correct answer is the first, and it only came out right because the server happened to be close to the user's offset. Users also have no timezone setting at all.

**Missing:**
- a PWA manifest, icons, service worker and offline fallback;
- server-delivered Web Push (VAPID, subscriptions, scheduler);
- any real OAuth wearable provider (token storage, consent, sync, revocation);
- automated accessibility checks (no axe);
- text alternatives for charts;
- an iOS `viewport-fit=cover`, which `env(safe-area-inset-*)` needs in order to work.

**Incomplete:** local reminders are tied to the server-local hour and a UTC date key.

## External dependencies

| Dependency | Needed for |
|---|---|
| Oura developer app (client id/secret, redirect URI) | A live Oura connection |
| Fitbit / Google Health developer access | A live Fitbit connection. Access terms are changing; must be re-verified. |
| Native iOS app with HealthKit entitlement | Apple Health |
| Native Android app with the Health Connect permission declaration | Health Connect |
| Garmin Health API partner approval | Garmin |
| VAPID key pair in server env, HTTPS deployment, real devices | Production push delivery |
| Physical iOS/Android devices, Safari, Firefox, screen readers | Real-device and assistive-technology verification |

## Risks

- Timezone bugs silently corrupt history, baselines and insights, and are invisible in single-timezone testing.
- A careless service worker could cache personal pages or break auth and updates.
- OAuth tokens are high-value secrets; they need encryption at rest, `state` + PKCE, and revocation on disconnect or deletion.
- Push content could leak wellbeing details onto a lock screen.

## Sequence

0. This audit.
1. Timezone: canonical rules, a per-check-in timezone, a user setting, DST-safe calendar maths, tests.
2. Accessibility: axe over all pages in both themes, fixes, chart text alternatives.
3. Device/PWA: manifest, icons, a conservative service worker, viewport fixes, compatibility suite.
4. Wearables: an OAuth framework with encrypted tokens, an Oura adapter, a native companion contract.
5. Web Push: subscriptions, VAPID delivery, a timezone-aware scheduler.
6. Security review.
7. Regression.
8. Reports.

Push depends on the Phase 3 service worker, and both depend on the Phase 1 user timezone for scheduling, so that order is kept.

## Baseline results (before any change)

```
npx tsc --noEmit -p .   → exit 0
npm test                → # tests 100  # pass 100  # fail 0
```
