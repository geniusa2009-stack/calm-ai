# Device & browser compatibility

## What was actually available

| | Available in this environment |
|---|---|
| Browser engines | **Chromium only**: Playwright's Chromium 153 (`chromium-1243` headless shell, plus the full build in new-headless mode) |
| WebKit / Safari, Firefox / Gecko | **Not installed.** Not tested. |
| Physical devices | **None.** Every "device" below is **Chromium device emulation**: viewport, DPR, touch and UA. That is **not** iOS Safari or real Android hardware. |
| Screen readers | **None** (see `docs/accessibility-audit.md`) |

## Automated matrix (`npm run e2e:compat`, emulation)

Every profile loads all 11 app pages in a seeded demo account and checks for:
- no horizontal overflow;
- no interactive target under 24px (WCAG 2.5.8) on touch profiles;
- cumulative layout shift under 0.1;
- no page errors.

| Profile (emulated in Chromium) | Physical? | Result |
|---|---|---|
| iPhone SE 375×667 | Emulator | Pass |
| iPhone 13 390×844 | Emulator | Pass |
| iPhone 14 Pro Max 430×932 | Emulator | Pass |
| Pixel 7 412×915 | Emulator | Pass |
| Galaxy S9+ 320×658 | Emulator | Pass |
| iPad Mini 768×1024 | Emulator | Pass |
| iPad Pro 11 landscape | Emulator | Pass |
| Desktop 1280×800 | Chromium | Pass |
| Desktop 1920×1080 | Chromium | Pass |

The suite also checks the following, all passing:
- the viewport has `viewport-fit=cover` (needed for iOS safe areas) and `interactive-widget=resizes-content`;
- WCAG reflow at **320px wide with 200% text** on Today, Check-in, Patterns and Settings;
- the manifest is installable-shaped (standalone, start URL, 192/512/maskable icons all served);
- the service worker registers and controls the page after reload;
- the offline fallback shows no personal data;
- the cache holds **only** `/_next/static/*`, `/icons/*` and `/offline.html`, never HTML or API responses;
- a failed save keeps the form and shows an error.

The UI suite (`npm run e2e`) also runs the main journeys at phone, tablet and desktop sizes, and the theme suite runs all pages in light and dark at phone and desktop sizes.

## Issues found and fixed during this pass

| Issue | Cause | Fix |
|---|---|---|
| Mobile pages could be wider than the screen | The mobile grid track was `1fr`, so one wide table stretched the whole column | `minmax(0, 1fr)`; tables scroll in their own container |
| The bottom nav overflowed at 200% text | Five `1fr` columns | `repeat(5, minmax(0, 1fr))`, with labels allowed to wrap |
| Settings overflowed at 200% text | A non-wrapping header row and a long unbreakable path | `flex-wrap`; `overflow-wrap: break-word` across the app |
| A closed "Show the numbers" table still widened the page | Chromium lays out closed `<details>` content | Hidden from layout while closed |
| An 18px checkbox on touch screens | Default size | 24px on `pointer: coarse` |
| **The page reloaded on the first visit** after installing the SW | `clients.claim()` fires `controllerchange`, and the code reloaded on it | Reload only after the person accepts an update |
| iOS safe-area insets had no effect | No `viewport-fit=cover` | Added |

## PWA

- `app/manifest.ts`: standalone display, original palette, icons at 192, 512, maskable 512 and Apple 180.
- `public/sw.js` is deliberately conservative:
  - it **caches no pages and no API responses**, so no wellbeing data is ever stored on the device and sign-in always goes to the server;
  - navigations are network-first, with `/offline.html` only when the network fails;
  - hashed static assets are cache-first;
  - updates are offered as "A new version is ready → Reload", never applied mid-session;
  - `sw.js` is served with `Cache-Control: no-cache`.
- It's registered only in production builds.

## Not tested (needs real devices / engines)

- **iOS Safari** (all versions), plus Home Screen install, standalone display, safe areas on notched hardware, keyboard and viewport resizing, rubber-band scrolling, and Web Push (iOS 16.4+, Home Screen only).
- **Android** Chrome and Firefox on hardware: install prompt, push delivery, background behaviour, keyboard.
- **Desktop** Safari, Firefox and Edge.
- Real network conditions (slow 3G, captive portals), low-power modes, OS text-size settings, and RTL locales.

## Manual protocol for physical devices

For each of iPhone (iOS 17+ and 16.4), Android (Chrome, Firefox), and desktop Safari, Firefox and Edge, run each check and record the device model, OS version, browser version, pass/fail and screenshots:

1. **Install:** Safari → Share → Add to Home Screen, or Chrome → Install. It opens standalone, the status bar and safe areas look right, and the bottom nav clears the home indicator.
2. **Sign up, then check in:** the keyboard doesn't cover the focused field and the page doesn't jump. The Save button stays reachable.
3. **Rotate** on every page. Then set the OS text size to the largest: no overlap, no horizontal scroll.
4. **Navigation:** open the More sheet; it closes with Back/Escape. Open each dialog and close it, and check that focus returns to where it was.
5. **Theme:** set Light / Dark / System, change the OS theme, and kill and reopen the app.
6. **Notifications:**
   - On iOS, from the installed app only: Settings → Device & permissions → Reminders. The prompt appears only after the tap.
   - Send a test push. Lock the device: the text is generic.
   - Deny, then check the guidance text. Revoke in OS settings, reopen, and check the subscription is removed.
7. **Offline:** turn on airplane mode and reload. The offline page appears with no personal data. Turn the network back on, retry, and the app returns.
8. **Breathing session:** the screen stays on (if enabled), and haptics work on Android.
9. **Timezone:** change the device zone. The travel prompt appears, and past days don't move.
10. **Update:** deploy a new build. "A new version is ready" appears, and Reload works.
