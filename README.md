# Calm

A prototype for personal wellbeing tracking. It learns what *your* usual looks like from short check-ins, notices slow drifts away from it, and suggests support that has actually worked for *you*. It is not a diagnosis tool, a medical device, or a crisis service, and it makes no claim of clinical validity.

**Status:** a working multi-user prototype. It has **not** been security-reviewed or validated on real users. See `SECURITY.md` and `docs/ENGINE_AUDIT.md`.

## Run it locally

Requires Node 20+ (tested on Node 22). On Linux, `better-sqlite3` builds natively, so you need the usual build tools.

```bash
npm install
npm test               # typecheck isn't included; run `npm run typecheck` too
npm run dev            # http://localhost:3000
# or, production mode:
npm run build && npm start
```

Open the app. You can **create an account**, or click **Try the demo** for a throwaway account with six weeks of made-up data (deleted after 48 hours).

Optional environment variables (see `.env.example`; put real values in `.env`, which is git-ignored):

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Turns on the AI companion. Everything else works without it. |
| `CALM_COMPANION_MODEL` | Override the companion model (default `claude-opus-5-5`). |
| `CALM_DB_PATH` | SQLite file (default `./data/calm.db`, git-ignored). |
| `CALM_TRUST_PROXY=1` | Trust `X-Forwarded-For` for rate limiting. Only set this behind a proxy you control. |
| `CALM_INSECURE_COOKIES=1` | Drop the `Secure` cookie flag in production mode for plain-HTTP testing on a non-localhost host. |

Other scripts:
- `npm run seed`: create a demo account from the CLI.
- `npm run claim-legacy -- you@example.com`: move data from the old single-user version into a registered account.
- `npx tsx scripts/audit-engine.ts`: re-run the engine measurements.

Schema migrations run automatically on startup.

## What's in it

| Area | Where |
|---|---|
| **Accounts and sessions**: scrypt passwords, hashed session tokens, CSRF checks, throttling, password change, account deletion | `lib/auth.ts`, `lib/http.ts`, `lib/session.ts`, `app/api/auth/*` |
| **Per-user data isolation** on every table and query | `lib/db.ts`, `lib/migrations.ts` |
| **Calm Pulse**: state relative to your own baseline, with drivers and a confidence heuristic | `lib/engine/pulse.ts`, `baseline.ts` |
| **Early Shift Radar**: multi-day shifts scaled to your own variability, plus long-horizon drift | `lib/engine/radar.ts` |
| **Context patterns**: Welch t-tests with Benjamini–Hochberg FDR | `lib/engine/context.ts`, `stats.ts` |
| **Recovery tracking**, with check-in gaps flagged as uncertain | `lib/engine/recovery.ts` |
| **Support Engine / Calm Window**: 8 tools, ranked by personal efficacy | `lib/engine/support.ts`, `app/support` |
| **Weekly insights** with "does this fit?" feedback, **What-If Lab**, **Personal Memory** | `lib/engine/insights.ts`, `whatif.ts`, `app/memory` |
| **Modes**, **smart nudges**, **Trusted Circle**, **Professional Bridge** | `lib/modes.ts`, `lib/snapshot.ts`, `app/circle` |
| **AI companion** with guardrails, optional | `lib/companion.ts` |
| **Safety layer**: deterministic crisis detection that runs before any model call | `lib/safety.ts` |
| **Passive signals**: provider interface, validated JSON import, demo provider | `lib/signals/*`, see `docs/SIGNALS.md` |
| **Data rights**: export, wipe data, delete account | `app/api/export`, `app/api/reset`, `app/api/account` |

## Tests

`npm test` runs 74 tests:
- **Engine:** baselines, pulse, radar, context, recovery, support, what-if and insights.
- **Scenarios:** stable, noisy, abrupt, gradual, missing data, leakage and ordering, all on seeded synthetic data.
- **Security:** route-coverage scan, 401 on every protected handler, cross-user read/update/delete attempts, CSRF, sessions, throttling, deletion cascade, demo separation, migrations.
- **Signals:** validation, duplicates, corrections, out-of-order and delayed data, overlap, timezone, isolation.

## Docs

- `SECURITY.md`: security model, findings and fixes, known gaps.
- `docs/ENGINE_AUDIT.md`: measured false-alarm and detection rates, statistical limitations.
- `docs/SIGNALS.md`: what is and isn't integrated, the import format, how to add a provider.

## Known limitations

- **Not clinically validated.** The thresholds were tuned on synthetic data only.
- **No live wearable integrations.** There's file import and a demo provider only.
- **Time zones:** check-in days are grouped in the **server's** time zone. Wearable readings can carry a device offset, but check-ins can't yet.
- **Deployment:** single process with SQLite. No email verification, password reset or MFA, and no scheduled sync jobs.
- **Notifications** are in-app only.
