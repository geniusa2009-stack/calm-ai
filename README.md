# Calm

A prototype of a personal wellbeing tool. It learns what *your* usual looks like, notices slow drifts away from it, and suggests support that has actually worked for *you*.

It isn't a meditation library, a chatbot, or a diagnosis tool. It never compares you to anyone else.

## Running it

```bash
npm install
npm run dev            # http://localhost:3000
npm test               # 25 engine, safety and data tests
npm run build && npm start
```

When you first open it, you choose between starting fresh and loading six weeks of **demo data**. Demo data is clearly labelled and can be wiped in Settings. To seed it from the command line instead, run `npm run seed`.

**Optional AI companion:** set `ANTHROPIC_API_KEY` (see `.env.example`). Without a key the rest of the app works fully. The companion says plainly that it isn't configured, and the safety responses still work.

## What's in it

| Feature | Where | How it works |
|---|---|---|
| **Calm Pulse** | Today | Your recent state compared with your own baseline. It shows a state label, a 0–100 gauge (60 = your usual), the main drivers, and how confident the read is. |
| **Personal baseline** | `lib/engine/baseline.ts` | Robust median and spread over a trailing 35-day window. The last 3 days are left out so a current shift doesn't become the new "normal". A population prior covers the first days and fades out completely by day 21. |
| **Early Shift Radar** | Today | Multi-day checks: stress staying high, sleep slipping, energy falling while stress rises, mood swings, a quiet mood slide, bouncing back, and check-in gaps. Each signal shows its evidence and why it might matter. |
| **Context intelligence** | Patterns | How tags affect you on the same day and the next day. An effect has to pass a Welch t-test before it's shown, and next-day effects need stronger evidence. Also covers the sleep link and weekday rhythm. |
| **Recovery tracking** | Patterns | Finds harder stretches, measures how long you take to come back, and looks for what tends to be present when you recover. |
| **Support Engine / Calm Window** | Support | 8 tools: three breathing patterns, 5-4-3-2-1 grounding, a two-minute reset, a generated soundscape, wind-down and reflection. They're ranked by how well they fit your current state, the time of day, your mode, and your own results so far. You rate stress before and after each session. |
| **Adaptive feedback** | everywhere | Session results re-rank tools. Insight "doesn't fit" hides that insight. A clear win is saved to Memory automatically. |
| **Personal Memory** | Memory | Things that help, triggers, wins and notes. Pinned items are what the companion sees. |
| **Weekly insights** | Patterns | Up to 6 cards, each with a confidence level, re-ranked by your feedback. |
| **What-If Lab** | Lab | Cautious estimates built only from your own patterns. Effects are shrunk, capped at ±2 and given a range, and the page says plainly that these are associations, not proven causes. |
| **Modes** | Settings | Everyday, Study, Work, Activity and Recovery. Each changes the suggested tags, preferred tools, how many nudges you get, radar sensitivity, and the companion's tone. |
| **Smart nudges** | Today | In-app only. They respect quiet hours and are capped per mode. |
| **Trusted Circle & Professional Bridge** | Circle & help | Your own contacts with copyable messages (Calm never contacts anyone). If 2 weeks stay hard, it gently suggests a professional and offers a self-reported summary you can choose to share. |
| **AI companion** | Companion | Claude (`claude-opus-5-5`, low effort, server-side refusal fallback). Guardrails: not a therapist, no diagnosis, no medication advice. Whether it sees your data is your choice. |
| **Data rights** | Settings | Export everything as JSON, or delete everything. |

## Safety

`lib/safety.ts` runs **before** any model call, on companion messages and on check-in notes. It doesn't depend on an API key. If it detects crisis language, it shows region-specific crisis lines plus findahelpline.com, and the companion doesn't try to coach. Tests cover the obvious true positives and common figures of speech like "this deadline is killing me".

## Architecture

```
app/            Next.js 14 app-router pages + /api routes (validated JSON)
lib/db.ts       SQLite (better-sqlite3), schema + data access
lib/engine/     pure, tested functions: days → baseline → pulse/radar/context/recovery/support/insights/what-if
lib/snapshot.ts composes engine output for a page render
lib/companion.ts, lib/safety.ts, lib/summary.ts, lib/seed.ts
tests/          node:test via tsx
```

The engine modules are pure functions over a list of `Day` records, so they're easy to test and to move (to a mobile client, for example).

## Known limitations

- Single user with no authentication. Meant to run locally or behind your own auth.
- Days are grouped using the server's timezone.
- Notifications are in-app only. No push or wearable integrations yet.
- The statistics are deliberately simple and explainable. With a few weeks of data, some "early hint" associations will be chance.
- This is not a medical device. It doesn't diagnose and it isn't a crisis service.
