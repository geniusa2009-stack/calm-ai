# UX, motion and device permissions

## Design system (`app/globals.css`)

All components use tokens defined on `:root`, with dark-mode overrides under `prefers-color-scheme: dark`:

- **Colour:** warm neutral surfaces (`--bg`, `--surface`, `--surface-2/3`), one sage accent (`--accent*`), and state colours (`--calm`, `--stretch`, `--strain`, `--low`, `--bright`). Small text uses `--ink-3`, which keeps at least 4.5:1 contrast on surfaces.
- **Type:** system font stack; scale `--fs-xs` … `--fs-3xl`.
- **Space:** 4px grid, `--s-1` … `--s-12`. **Shape:** `--r-sm/md/lg/xl/pill`. **Elevation:** `--shadow-1/2/3`.
- **Motion:**
  - Durations: `--dur-fast` 140ms, `--dur` 240ms, `--dur-slow` 420ms, `--dur-pulse` 900ms.
  - Easing: `--ease` (gentle ease-out), `--ease-in-out`.
  - Entrance offset: `--rise`.
- **Touch:** `--tap` is 44px. Buttons, inputs and the mobile nav meet it (checked in e2e).

Reusable pieces:
- `components/ui/index.tsx`: `PageHeader`, `EmptyState`, `Notice` (status or alert), `Skeleton`, `Spinner`.
- `components/ui/Dialog.tsx`: native `<dialog>` with focus trap, Escape to close, focus returned to the opener, and a sheet variant.
- `components/PulseRing.tsx`: animated gauge with a text alternative.
- Route-level files: `app/template.tsx` (page entrance), `app/loading.tsx` (skeleton), `app/error.tsx`, `app/not-found.tsx`.

## Motion

- **Animation technique:** only `transform` and `opacity` are animated. The one exception is the Pulse arc's `stroke-dasharray`, which is a cheap SVG paint.
- **What moves:**
  - pages fade and rise in;
  - main sections stagger in, 50ms apart, capped at 280ms;
  - the Pulse arc draws, its number counts up, and the state label cross-fades;
  - dialogs and sheets scale or slide in;
  - setup steps slide in;
  - buttons, chips and cards respond to hover and press;
  - the companion shows a typing indicator, and loading screens show skeletons.
- **Reduced motion:** `prefers-reduced-motion: reduce` sets every duration to 1ms, removes the rise offset, swaps movement keyframes for a plain fade, stops shimmer and looping animations, and makes `useAnimatedNumber` jump straight to its value. The e2e run checks this in a reduced-motion browser context.
- **Never in the way:** no animation blocks input or delays an action; content is clickable immediately.

## Device capabilities

| Capability | API | Prompt? | Used for | Status |
|---|---|---|---|---|
| Reminders | Notification API | Yes, only after tapping **Enable** | Generic check-in / radar reminders, max 2 a day, never in quiet hours | ✅ Implemented. **Only while Calm is open in a tab** (there's no push server or service worker push) |
| Screen on | Screen Wake Lock API | No prompt exists | Holding the screen on while a guided session runs | ✅ Implemented. Released on finish or leave; re-acquired when the tab is visible again |
| Haptic cues | Vibration API | No prompt exists | A short tap at each breathing phase | ✅ Implemented where supported. **Not available on iOS Safari** or most desktops |
| Health / wearables | none in browsers | — | File import via `lib/signals` | ✅ Import only. Apple Health, Health Connect, Oura, Fitbit and Garmin are **not** connected (see `docs/SIGNALS.md`) |
| Location, microphone, camera, motion sensors | — | Never | No existing feature needs them | ❌ Deliberately not used (enforced by a static test) |

How the permissions behave:
- **No surprise prompts.** Reading status never prompts. `requestNotifications()` is the only path to a prompt, and it's called only from click handlers in the setup flow and in Settings. Tests check both: a static scan, and an e2e run that counts prompts on every page load.
- **Denial is final.** After a denial Calm never asks again. It explains how to change the setting in the browser's site settings.
- **Dismissal is not denial.** Closing the prompt without choosing counts as "no decision", and the person can try again from Settings.
- **Unsupported is labelled.** If a capability isn't available, it's marked unsupported and the setup continues.
- **Nothing sensitive is stored.**
  - The server stores only on/off preferences (`notifyEnabled`, `wakeLockEnabled`, `hapticsEnabled`) and setup progress (`deviceSetup`, `deviceStep`). It never stores the browser's permission state.
  - `localStorage` holds only which reminder ids were already shown today.
  - Reminder text never contains wellbeing details, because it can appear on a lock screen.

## Onboarding flow (`/setup/devices`)

1. The intro screen explains the setup is optional.
2. Each capability then gets its own step: what it enables, why Calm asks, what's accessed, an "Optional" label, live browser support, and **Enable** or **Skip for now**.
3. After a choice, the step shows the actual result.
4. The last step summarises what's on and lists what Calm never asks for.

It's offered once, as a dismissible card on Today after the first check-in. It's never forced. It can be skipped at any step, resumes where it was left (progress is saved per step), and can be restarted from Settings → Device & permissions.

## Verification

- `npm test`: unit tests in `tests/device.test.ts` cover every permission outcome, the reminder policy, reduced motion, the settings contract and the static guarantees.
- `npm run e2e` against a running server: `e2e/ui.e2e.cjs` uses the machine's Playwright. It drives the granted, denied, dismissed, unsupported, skip, resume and revisit paths, checks dialog keyboard behaviour and reduced motion, and checks every page at phone, tablet and desktop sizes for overflow and page errors.
