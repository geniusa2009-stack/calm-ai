# Deployment (HTTPS) and final verification

## Deploy on one VM (Docker + Caddy, automatic HTTPS)

1. **DNS:** create an A/AAAA record for your domain pointing at the VM. Open ports 80 and 443.
2. **Code:** `git clone https://github.com/geniusa2009-stack/calm-ai && cd calm-ai`
3. **Config:** `cp .env.example .env`, then fill in:
   - `CALM_DOMAIN`: your hostname (Caddy obtains the certificate).
   - `CALM_TOKEN_KEY`: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
   - **VAPID keys:** run `npm ci && npm run push:keys` and paste the three lines into `.env`. Generate them on the server and never commit them.
   - Optional: `ANTHROPIC_API_KEY`, and `OURA_CLIENT_ID` / `OURA_CLIENT_SECRET` (see below).
4. **Run:** `docker compose up -d --build`. This starts three services:
   - `app`: Next.js production server; SQLite on the `calm-data` volume;
   - `push-sweep`: runs `npm run push:sweep` every 15 minutes;
   - `caddy`: HTTPS and HSTS.
5. **Check:**
   - `https://<domain>/manifest.webmanifest` returns 200;
   - `https://<domain>/sw.js` returns 200 with `no-cache`;
   - `docker compose logs push-sweep` shows `{"configured":true,…}`.
6. **Backups:** snapshot the `calm-data` volume, and use disk encryption on the VM.

Verified in development: the production build; `/sw.js`, the manifest, the offline page and icons; push config and subscribe (200 valid / 400 invalid / 403 cross-site / 401 signed out); `push:sweep` with real VAPID keys (claimed a reminder by the user's local date, sent to FCM, pruned the synthetic subscription on 410, deduplicated the second run); and SW registration (compat 14/14). **Not verified:** the Docker image build, because the sandbox's containers had no DNS. Build it on the target host.

## Enable Oura (needs real credentials)

1. In the Oura developer portal, create an app with redirect URI `https://<domain>/api/integrations/oura/callback`.
2. Put `OURA_CLIENT_ID` and `OURA_CLIENT_SECRET` in `.env` (plus `CALM_TOKEN_KEY`), then run `docker compose up -d`.
3. Check the endpoints, the `daily` scope, PKCE support and the field names in `lib/integrations/oura.ts` against Oura's current docs.
4. With a real Oura account:
   1. **Settings → Connected data → Connect Oura.** You should see the consent screen, then return to Calm showing "Connected".
   2. Confirm the database holds only `v1.`-prefixed (encrypted) tokens: `sqlite3 /data/calm.db "select substr(access_token_enc,1,3) from provider_connections"`.
   3. **Sync now.** Imported nights should match the Oura app.
   4. Wait for the token to expire (or edit `expires_at` to the past), then sync again. It should refresh silently.
   5. **Disconnect.** The token should be revoked; a second sync fails with "isn't connected".
5. Then set `externallyVerified: true` in `oura.ts`.

## Shortest real-device checklist (≈30 minutes per device)

Record the device model, OS, browser and pass/fail. Use the deployed **HTTPS** URL.

| # | iPhone iOS 16.4+ (Safari) | Android (Chrome) | Desktop (Safari / Chrome / Firefox / Edge) |
|---|---|---|---|
| 1 | Share → **Add to Home Screen**, open from the icon: standalone, safe areas, bottom nav clears the home bar | Menu → **Install app**: standalone | Install (Chrome/Edge) |
| 2 | Sign up, then check in: the keyboard doesn't hide the focused field | same | same |
| 3 | **In the installed app:** Settings → Device & permissions → Reminders. The prompt appears only after the tap. **Send a test push**, then lock the screen: the notification arrives and its text is generic | Same, in the installed app or the browser | Same |
| 4 | Fully close the app and wait for the reminder hour (set it to the next hour): a push arrives (**this is real delivery**) | same | same |
| 5 | Revoke notifications in iOS Settings and reopen: the switch shows "Blocked", and the subscription is removed (the push test then sends 0) | Same, via Android settings | Same, via site settings |
| 6 | Airplane mode, then reload: offline page with no personal data | same | same |
| 7 | Light / Dark / System; largest OS text size; rotate | same | Zoom 200% |

## Shortest assistive-technology checklist

| # | VoiceOver (iOS/macOS) | TalkBack (Android) | NVDA + Firefox/Chrome (Windows) |
|---|---|---|---|
| 1 | Rotor → Headings on Today: one "Good …" h1 and logical h2s | Reading controls → Headings | `H` / `1` keys |
| 2 | Landmarks: Main, navigation; the skip link works | same | `D` key |
| 3 | Complete a check-in: every slider announces its name and value; "Thanks — saved" is announced | same | same (Tab / arrow keys) |
| 4 | Open and close **More** and "Delete all my wellbeing data…": the title is announced; focus returns to the button | same | Escape closes |
| 5 | Patterns chart: the summary is read; "Show the numbers" opens a table with headers | same | Table navigation |
| 6 | Device setup: each result message (granted, denied, unsupported) is announced | same | same |
| 7 | A failed save (offline) is announced as an alert | same | same |
