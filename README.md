# Calm

Calm is a personal wellbeing tracker built around a simple idea: meaningful changes are easier to spot when you compare them with your own usual patterns, rather than someone else's.

A short daily check-in records stress, mood, energy, and optional context. Over time, Calm builds a personal baseline, highlights sustained changes, and recommends short exercises based on what has helped before.

Calm is a working prototype, not a medical device or a substitute for professional care. Its analysis has been evaluated with synthetic data, not validated in clinical studies or with real users. The application has not had an independent security review.

## Getting started

You'll need Node.js 20 or later. Native build tools may also be needed for `better-sqlite3` on Linux.

```bash
npm install
npm run typecheck
npm test
npm run dev
```

Open http://localhost:3000 to create an account or use the demo with synthetic data. Demo accounts expire after 48 hours.

For a production-mode build:

```bash
npm run build
npm start
```

## What Calm includes

- **Daily check-ins:** quick mood, stress, and energy tracking, with optional details.
- **Calm Pulse:** a snapshot of the day compared with a personal baseline.
- **Early Shift Radar:** signals for persistent changes and longer-term drift.
- **Patterns and insights:** statistical associations, confidence labels, and feedback.
- **Support tools:** short activities ranked by their observed effect for the individual.
- **Memory and What-If Lab:** personal notes and exploratory projections.
- **Trusted Circle:** a way to connect personal support with routes to professional help.
- **Optional AI companion:** short, reflective responses powered by the Anthropic Claude API. The companion is disabled without an API key; the rest of Calm remains usable.
- **Privacy controls:** account sessions, per-user data isolation, data export, reset, and account deletion.
- **Device features:** optional reminders and other supported capabilities, requested only when needed.

The companion is separate from the statistical engine. A deterministic safety check runs before model requests. Neither component provides a diagnosis or treatment recommendation.

## Configuration

Create a local `.env` file if you need to override the defaults. It is excluded from Git.

| Variable | Use |
| --- | --- |
| `ANTHROPIC_API_KEY` | Enables the optional Claude companion |
| `CALM_COMPANION_MODEL` | Selects the companion model; defaults to `claude-opus-5-5` |
| `CALM_DB_PATH` | SQLite database path; defaults to `./data/calm.db` |
| `CALM_TRUST_PROXY=1` | Trusts forwarded client IPs for rate limiting; enable only behind a controlled proxy |
| `CALM_INSECURE_COOKIES=1` | Allows plain-HTTP cookies in production mode for local testing only |

See `.env.example` for the full configuration.

## Useful commands

| Command | Purpose |
| --- | --- |
| `npm run typecheck` | TypeScript type checking |
| `npm test` | Unit and integration tests |
| `npm run build` | Production build |
| `npm run seed` | Create a demo account from the command line |
| `npx tsx scripts/audit-engine.ts` | Reproduce engine measurements |

For browser testing, build and start Calm on a separate port, then point the E2E runner to it:

```bash
CALM_DB_PATH=/tmp/calm-e2e.db npm start -- -p 3100
```

In a second terminal:

```bash
E2E_URL=http://localhost:3100 npm run e2e
```

## Project documentation

- [Security](SECURITY.md) — implemented protections, outstanding risks, and review notes.
- [Engine audit](docs/ENGINE_AUDIT.md) — synthetic-data measurements and statistical limitations.
- [Signals](docs/SIGNALS.md) — import format, available providers, and integration boundaries.
- [Experience and accessibility](docs/UX.md) — interface, motion, and device behavior.

## Before real-world use

Calm still needs independent security testing, stronger account recovery and verification, and validation with consenting participants. Synthetic tests cannot establish clinical accuracy or real-world effectiveness.

Treat the product as an experimental wellbeing tool until those gaps have been addressed.
