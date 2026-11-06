# Accessibility audit (target: WCAG 2.2 AA)

## Method

| Check | Tool | Coverage |
|---|---|---|
| Automated rules | **axe-core 4.14** (`npm run e2e:a11y`), tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa` | 11 app pages + sign-in, **light and dark × desktop and phone**, plus the open "delete data" dialog: **49 page states**. Reduced motion is on, so settled UI is audited, not animation frames. |
| Structure | Custom script, same run | Exactly one `h1`, no skipped heading levels, one `<main>`, `lang` set, **unique page titles** |
| Keyboard | Custom script plus the UI suite | The skip link is the first Tab and lands on `<main>`. Every Tab stop has a visible focus indicator. No keyboard trap. Dialogs trap focus, close on Escape and **return focus to the opener** (UI suite). |
| Reflow & text resize | Compatibility suite | 320 CSS px, 200% text: no horizontal scrolling (WCAG 1.4.4 / 1.4.10) |
| Target size | Compatibility suite | Nothing under 24×24 px on touch profiles (WCAG 2.5.8). Primary controls are 44px or more. |
| Reduced motion | UI + theme suites | Animations collapse to 1ms fades; the theme change has no cross-fade |
| **Screen readers** | **Not available here** | VoiceOver, TalkBack and NVDA were **not** tested (see below) |

## Results

| Run | axe violations | Structure issues | Keyboard |
|---|---|---|---|
| Baseline (start of this phase) | **27 violation groups** across 5 pages | 0 | Skip link OK, focus visible |
| Final | **0** across all 49 page states | **0** | Skip link → `#main`; 11 stops visited, 0 without a visible focus indicator; no trap |

## Issues found and fixed

| WCAG | Issue | Fix |
|---|---|---|
| 1.4.1 Use of colour | Inline links in paragraphs were recognisable only by colour (1.04–2.4:1 against the surrounding text) | Links inside running text are underlined |
| 1.4.3 Contrast | "Supported"/"High" pills 3.9:1, "Medium" pill 3.0:1, Pulse state label 3.3–3.8:1, "Delete…" text buttons 3.8:1, and the faded "Not available yet" provider rows | **Derived text tokens.** Each state hue is mixed toward the original ink: `--calm-text`, `--low-text`, `--bright-text`, `--strain-text`, `--stretch-text`, `--link`, all 4.5:1 or better (measured 5.3–5.5:1). The **exact original palette is kept** for fills, chart strokes, the Pulse ring and tints. The faded rows now use a surface tint instead of opacity. |
| 2.4.2 Page titled | Every page was titled "Calm" | Each page has its own title ("Patterns · Calm"), so the router announcer and browser tabs can tell them apart |
| 1.1.1 / 1.3.1 Charts | Charts were an SVG with a one-line label; series were told apart by colour | Each chart is a `<figure>` with a plain-language text summary (averages, range, latest value, direction, usual band; descriptive, never an assessment) and a **"Show the numbers"** data table with header cells |
| 1.4.10 Reflow | Overflow at 320px / 200% text in the bottom nav, Settings and tables | See `docs/device-browser-compatibility.md` |
| 2.5.8 Target size | 18px checkbox on touch | 24px on coarse pointers |

## What was already in place (verified, not newly added)

- Landmarks: `<nav>`, a single `<main id="main">`, and the skip link.
- Native `<dialog>` with focus trap, Escape, `aria-labelledby` and focus return.
- `role="alert"` for errors and `role="status"` / `aria-live` for saving and loading.
- `aria-pressed` on toggle chips, and `role="switch"` on switches (real checkboxes).
- Visible `:focus-visible` outlines; reduced-motion support.
- The Pulse ring has a full text alternative ("Calm Pulse 32 out of 100, Strained. 60 is your usual.").

## Not verified, and why

- **Screen readers:** VoiceOver (iOS/macOS), TalkBack (Android) and NVDA (Windows) need the real OS and assistive technology, and none is available in this container. Automated checks find only part of real-world issues. Recommended manual pass:
  1. Navigate every page by headings and by landmarks.
  2. Complete a check-in by voice and by switch control.
  3. Open and close each dialog and the More sheet.
  4. Confirm that save errors and the "saved" status are announced.
  5. Read a chart via its summary and its table.
  6. Run the device setup flow and confirm each result message is announced.
- **Windows High Contrast / forced colours** and **OS-level large text** on real devices.
- **Cognitive accessibility review** with users (plain-language wording was applied, but not user-tested).

## Running it

```
npm run build && CALM_DB_PATH=/tmp/a11y.db npm start -- -p 3100
E2E_URL=http://localhost:3100 npm run e2e:a11y
```
