# Production readiness report

Scope: timezone reliability, real-device and cross-browser QA, accessibility (WCAG 2.2 AA), wearable integrations, Web Push. Baseline: commit `5f1a22e`. Audit: `docs/production-readiness-audit.md`.

## A. Executive summary

**Implemented and verified in this environment:**
- **A timezone architecture** that never uses the server's zone. It adds a per-user IANA zone, records the zone on each entry, and uses DST-safe calendar maths. The full suite passes with the server in four different timezones.
- **0 axe-core violations** across 49 page states (all pages, light/dark, desktop/phone, plus a dialog), from a baseline of 27. Charts have text alternatives, every page has a unique title, and reflow, target size and reduced-motion bugs were fixed.
- **A conservative PWA:** a manifest and icons, plus a service worker that caches no personal data, with an offline fallback and update handling. Everything passes on 9 emulated device profiles.
- **A provider-agnostic OAuth framework** (PKCE, state, encrypted tokens, refresh, retry, revoke) with an **Oura adapter**, plus a native-app data contract.
- **Server Web Push:** VAPID, encrypted payloads, subscriptions, a timezone-aware scheduler, atomic dedupe and lifecycle cleanup. The real request path was verified live against FCM.

**Not verified here** (it needs things this environment doesn't have):
- physical devices; Safari and Firefox engines; screen readers;
- push delivery to a real browser or device;
- Oura's live API, which needs credentials and access to its official docs.

**Blocked externally:**
- **Fitbit:** the legacy API was switched off on 2 Nov 2026; its replacement requires Google's restricted-scope review.
- **Garmin:** needs partner approval.
- **Apple Health / Health Connect:** need native apps.

## B. Workstream results

### A — Timezone
- **Existing state:** every calendar computation used the server's local zone. The same Cairo check-ins produced different days in UTC, Tokyo and Los Angeles (demonstrated in the audit).
- **Changes:**
  - `lib/time.ts` provides zone-explicit local dates and parts, offsets, wall-clock to UTC conversion with defined DST gap and overlap rules, DST-independent calendar arithmetic, and deterministic formatting.
  - New user setting: `settings.timezone`. A new `tz` column records the zone on check-ins and support sessions.
  - Detection at sign-up, demo start and sign-in, *only if unset*; a travel prompt instead of silent changes; a settings picker.
  - Threaded through the engine, snapshot, summary, companion, what-if, recovery, quiet hours, evening ranking, greeting, charts, wearable attribution (readings may carry an IANA `timeZone`) and demo seeding.
- **Migration:** v4 adds the nullable `checkins.tz` and `support_sessions.tz` columns. Legacy rows use the current zone (documented).
- **Tests:** `tests/timezone.test.ts` (18 tests), and `npm run test:tz` (the full suite under UTC, Cairo, Los Angeles and UTC+14). Two existing fixtures that assumed server-local time were rewritten to be zone-explicit. Both are stricter now.
- **Known limitations:** legacy rows without a zone follow the user's current zone. Display uses a fixed `en-US` locale (deterministic SSR); localisation isn't in scope.
- **Details:** `docs/timezone-architecture.md`.

### B — Devices and browsers
- **Existing state:** no manifest, service worker or icons; no `viewport-fit=cover`, so iOS safe areas didn't apply.
- **Changes:**
  - `app/manifest.ts`, `public/icons/*`, `public/sw.js` (static assets only), `public/offline.html` and `ServiceWorkerRegistration`;
  - viewport `viewport-fit=cover` and `interactive-widget=resizes-content`;
  - overflow and reflow fixes (`minmax(0, 1fr)` grids, wrapping, word breaking, scrolling tables);
  - 24px checkboxes on touch;
  - a fix for an **unexpected reload on first SW install**.
- **Tests:** `e2e/compat.e2e.cjs` (14 checks, 9 profiles).
- **Known limitations:** Chromium emulation only (see D).
- **Details:** `docs/device-browser-compatibility.md`.

### C — Accessibility
- **Existing state:** 27 axe violation groups, mainly link-in-text-block and contrast. Charts had no text alternative. All pages were titled "Calm".
- **Changes:**
  - underlined inline links;
  - derived accessible text tokens, with the original palette kept for fills and strokes;
  - chart `<figure>`s with summaries and data tables;
  - unique page titles;
  - a reduced-motion fix: stagger delays no longer keep content hidden.
- **Tests:** `e2e/a11y.e2e.cjs` (axe + structure + keyboard), `tests/a11y.test.ts` (2), and a reduced-motion assertion in `tests/device.test.ts`.
- **Details:** `docs/accessibility-audit.md`.

### D — Wearables
- **Existing state:** file import and demo provider only; other providers were registry entries.
- **Changes:**
  - `lib/secrets.ts` (AES-256-GCM);
  - `lib/integrations/{types,oauth,oura,http}.ts`;
  - routes `/api/integrations/[provider]` (`connect`, `callback`, `sync`, disconnect);
  - revocation on account deletion after the password check;
  - Settings UI;
  - token-free export entries;
  - corrected registry statuses.
- **Migration:** v5 creates `provider_connections` and `oauth_states`.
- **Tests:** `tests/integrations.test.ts` (14 tests, mock provider).
- **Details:** `docs/wearable-integrations.md`.

### E — Web Push
- **Existing state:** local notifications only while a tab was open.
- **Changes:**
  - `lib/push/{store,send,schedule,sweep,client}.ts`;
  - `/api/push/{config,subscribe,test}`;
  - `sw.js` push, click and subscription-change handlers;
  - `PushSync`;
  - the bridge stands down when push is active;
  - sign-out unsubscribes;
  - category and hour settings;
  - `npm run push:sweep` and `npm run push:keys`.
- **Migration:** v5 creates `push_subscriptions` and `push_deliveries`.
- **Tests:** `tests/push.test.ts` (14 tests), plus a live FCM request.
- **Details:** `docs/push-notifications.md`.

**Bugs found by the new tests and fixed:**
- the `route()` wrapper crashed on `Response.redirect()` (immutable headers), so every redirecting route returned a 500;
- the push subscribe rate limit could never trigger;
- the first-visit service-worker reload;
- reduced-motion stagger delays.

## C. Integration status

| Item | Status |
|---|---|
| File import (JSON) | Implemented and tested |
| Demo wearable | Implemented and tested (synthetic, labelled) |
| OAuth framework (PKCE, state, encryption, refresh, revoke) | Implemented and tested |
| Oura adapter | Implemented but not externally verified |
| Oura live connection | Blocked by credentials |
| Fitbit (Google Health API) | Blocked by external approval |
| Garmin | Blocked by external approval |
| Apple Health (HealthKit) | Requires native application |
| Android Health Connect | Requires native application |
| Native companion device authentication | Not implemented (contract documented) |
| Web Push: server side (VAPID, encryption, scheduling, lifecycle) | Implemented and tested |
| Web Push: live request to FCM | Implemented and tested (FCM returned 410 for a synthetic subscriber; subscription pruned) |
| Web Push: delivery to a real browser or device | Implemented but not externally verified |

## D. Device test matrix

| Target | Physical / emulated | Version | Scenarios | Result | Untested |
|---|---|---|---|---|---|
| iPhone SE / 13 / 14 Pro Max | Chromium emulation | Chromium 153, Playwright 1.63 | All 11 pages: overflow, targets, CLS; UI + theme journeys | Pass | Real iOS Safari, Home Screen install, safe areas on hardware, keyboard, push |
| Pixel 7, Galaxy S9+ | Chromium emulation | same | same | Pass | Real Android Chrome/Firefox, install prompt, push delivery |
| iPad Mini, iPad Pro 11 | Chromium emulation | same | same | Pass | Real iPadOS Safari |
| Desktop 1280 / 1920 | Chromium (headless) | same | All suites | Pass | Desktop Safari, Firefox, Edge |
| 320px + 200% text | Chromium | same | Reflow on 4 key pages | Pass | OS-level text size |
| Offline / SW | Chromium | same | Registration, control, offline page, cache contents | Pass | Real-network conditions |

## E. Accessibility results

| Check | Result |
|---|---|
| axe-core 4.14, 49 page states | **0 violations** (baseline: 27 groups) |
| Heading, landmark and title structure | 0 issues |
| Keyboard | Skip link → `#main`, visible focus on every stop, no trap, dialogs return focus |
| Contrast | All text pairs ≥ 4.5:1 through derived tokens; exact original palette kept for non-text |
| Screen readers (VoiceOver / TalkBack / NVDA) | **Not tested:** unavailable here. Manual protocol in `docs/accessibility-audit.md` |
| Remaining violations | None automated. Unknown for manual and assistive-technology checks. |

## F. Security review

**Risks found and fixed:**
- the 500 on redirects in `route()`;
- an ineffective subscribe rate limit;
- server-zone dependence that could mis-date data;
- reminders keyed by UTC date;
- the OAuth redirect URI derived from the `Host` header (now `CALM_PUBLIC_URL` when set).

**Token storage:**
- OAuth tokens: AES-256-GCM at rest, server-only key, never in the browser, `localStorage`, logs or exports (tested).
- OAuth state: stored only as a hash, single-use, bound to user and provider, with a TTL. The PKCE verifier is encrypted.
- VAPID private key: server env only.

**User isolation:**
- Every new table has `user_id … ON DELETE CASCADE`.
- Every query is scoped. Cross-user state, subscription and disconnect attempts are tested as no-ops.
- All new routes go through `route()`. The automated coverage test now also covers the 7 new route files.

**Notification security:**
- generic payloads (tested), with status-only logging;
- endpoints are never exported in full;
- subscriptions are capped and rate-limited, and pruned on 404/410 or after repeated failures;
- the device unsubscribes on sign-out.

**Sensitive data:**
- no raw health values in logs;
- provider errors are stored as codes;
- the offline page shows no personal data;
- the service worker caches no HTML or API responses (tested).

**Remaining risks:**
- **No external security review or penetration test.**
- The SQLite file isn't encrypted at rest; use disk encryption.
- `CALM_TOKEN_KEY` rotation isn't implemented. Rotating the key requires reconnecting providers.
- No CSP `script-src` policy, because Next's inline scripts would need nonces.
- Single-process rate limits are stored in SQLite, which is fine for one node only.
- The legacy `login_attempts` table also holds push-attempt keys, pruned after 24 hours.

## G. Final quality gates (commands actually run on the final code)

| Command | Result |
|---|---|
| `npx tsc --noEmit -p .` | exit 0 |
| `npm test` | **148 tests, 148 pass, 0 fail** |
| `npm run test:tz` (UTC, Africa/Cairo, America/Los_Angeles, Pacific/Kiritimati) | pass ×4 |
| `npm audit --omit=dev` | 0 vulnerabilities |
| `npm run build` | Compiled successfully |
| `npm run e2e` (UI) | 21/21 |
| `npm run e2e:theme` | 13/13 |
| `npm run e2e:a11y` | 49 page states, 0 axe violations, 0 structure issues |
| `npm run e2e:compat` | 14/14 |
| Migration on a copy of the existing database (v3 → v5, run twice) | 7 users, 197 check-ins and 388 readings preserved; 0 FK violations; idempotent |
| Live push to FCM (synthetic subscriber) | HTTP 410 → subscription pruned |
| Real browser push subscription (full Chromium 153) | **Failed:** "Registration failed - permission denied" (no GCM keys in open-source Chromium). Not counted as a pass. |
| ESLint | **Not run:** not configured in the repository |

## H. Remaining external requirements

1. **Oura:** developer app credentials (`OURA_CLIENT_ID`, `OURA_CLIENT_SECRET`), `CALM_TOKEN_KEY` and `CALM_PUBLIC_URL`, plus network access to `cloud.ouraring.com` to verify the endpoints, then a test-account sync.
2. **Fitbit / Google Health API:** Google's restricted-scope security review.
3. **Garmin:** Health API partner approval.
4. **Apple Health / Health Connect:** native iOS and Android companion apps (entitlements, permission declarations, store review) and a device authentication mechanism.
5. **Push:** an HTTPS deployment, a VAPID key pair in server env, a cron job for `npm run push:sweep`, and physical iOS (16.4+, Home Screen) and Android devices to confirm delivery.
6. **Physical-device and cross-engine QA:** iOS/iPadOS Safari, Android Chrome/Firefox, and desktop Safari/Firefox/Edge, following the protocol in `docs/device-browser-compatibility.md`.
7. **Assistive technology:** VoiceOver, TalkBack and NVDA testing.
8. **An external security review** before handling real users' health data.

## Suggested next phase

Deploy to a staging HTTPS environment with VAPID keys and an Oura test app. Then:
1. Run the manual device protocol on real iPhone and Android hardware.
2. Run a screen-reader pass.
3. Verify Oura end to end, then flip `externallyVerified`.
4. Add ESLint and CI running the four e2e suites.
5. Commission a security review.
