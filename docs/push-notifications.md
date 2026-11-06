# Web Push notifications

Two distinct mechanisms, never both on the same device:

| | Local notifications (`NotificationBridge`) | Server push (this document) |
|---|---|---|
| Delivered when | Calm is open in a tab, including a background tab | Calm is closed too, where the browser or OS allow it |
| Requires | Notification permission | Permission, a service worker, VAPID keys on the server, and a push service |
| Used when | Push isn't configured or isn't supported | A push subscription exists on the device (the bridge stands down to avoid duplicates) |

## Flow

1. The person taps **Enable** (guided setup or Settings). Only that click can prompt for permission; nothing prompts on load (tested in e2e).
2. If permission is granted and the server has VAPID keys, the device calls `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` and the result goes to `POST /api/push/subscribe`.
3. A cron job runs **`npm run push:sweep`** every 15–30 minutes. For each opted-in user with a subscription:
   - compute what's due (`lib/push/schedule.ts`);
   - **claim** `(user, kind, local_date)` in `push_deliveries`;
   - only then send through `web-push` (VAPID, RFC 8292; `aes128gcm`, RFC 8291).
4. The service worker shows the notification. Tapping it focuses or opens Calm.

## Rules

- **Timezone:** local times and dates come from the user's saved IANA zone (`docs/timezone-architecture.md`). The duplicate check uses the **local** date, so the daily cap resets at local midnight even after travel (tested).
- **Quiet hours** (default 22:00–08:00, local) mean nothing is sent.
- **Check-in reminder:** at or after the chosen local hour (default 19:00), only if the person hasn't checked in today. **Radar heads-up:** once per local day, only for "notice" or "act" signals. Each category can be turned off.
- **At most 2 per local day.** Each kind at most once per day. No streaks, no escalation and no re-sending when ignored. Calm doesn't use engagement tactics.
- **Content is generic and safe for a lock screen.** Calm never includes measurements, states, notes, companion text or names (tested): "A quick check-in, whenever you have a moment." / "Calm noticed something worth a look. Open when it suits you."
- **Delivery:** TTL 12 hours, `Urgency: low`, and a `Topic`, so stale reminders collapse rather than pile up.

## Subscription lifecycle

| Event | Handling |
|---|---|
| Created | Validated: `https` endpoint, no credentials in the URL, `p256dh` = 65-byte P-256 point, `auth` = 16 bytes, body ≤ 4 KB |
| Replaced or expired by the browser | `pushsubscriptionchange` in `sw.js` re-subscribes and re-registers. `PushSync` also re-subscribes on load, **only if permission is already granted** |
| 404 / 410 from the push service | Deleted immediately (verified live against FCM; see below) |
| Repeated failures | Deleted after 5 consecutive failures |
| Permission revoked in the browser | `PushSync` unsubscribes and deletes on the server at the next visit |
| Reminders turned off | Unsubscribe and delete |
| Sign out | This device's subscription is removed first, so a shared device stops receiving reminders |
| Account deleted | All subscriptions and delivery history cascade-deleted (tested) |
| Same browser, different account | The endpoint moves to the account now signed in |

## Security

- The **VAPID private key** exists only in server env and was never committed. `npm run push:keys` generates a pair. Only the public key is served (`GET /api/push/config`).
- All push routes require a session and go through `route()`: same-origin check on writes, `no-store`, and redacted errors.
- A user can only remove **their own** subscriptions. An attempt to delete another user's endpoint is a no-op (tested). Exports show only the push service's hostname, never the endpoint path or keys.
- **Limits:** at most 10 subscriptions per user; at most 20 subscribe calls per user per hour (counted as attempts); a test push at most once a minute.
- Logs record the status code only, never the endpoint (a capability URL) or the payload.

## Platform support (as documented by the platforms; not all verified here)

| Platform | Server push |
|---|---|
| Chrome / Edge (desktop, Android) | Supported (FCM / WNS-backed) |
| Firefox (desktop, Android) | Supported (Mozilla autopush) |
| Safari on macOS 13+ | Supported (Apple Push Service) |
| **iOS / iPadOS 16.4+** | **Only for a web app added to the Home Screen** and opened from there, after permission is granted from a tap inside it. **Not in a Safari tab.** |
| iOS < 16.4, or in-app browsers (WebViews) | Not supported |

Background delivery also depends on OS battery and notification settings and Focus modes, which Calm can't control.

## Verification evidence

| What | How | Result |
|---|---|---|
| Validation, isolation, limits, scheduling, dedupe, timezone change, deletion, generic content | `tests/push.test.ts` (14 tests) | Pass |
| Real payload encryption and VAPID signing | `web-push` request builder: `Content-Encoding: aes128gcm`, a `vapid t=…, k=…` header, TTL/Urgency, ciphertext body | Pass |
| **Live request to a real push service** | A VAPID-signed, encrypted push sent to **FCM** for an unregistered token | FCM answered **410 Gone**; Calm deleted the subscription. Simulated subscriber, real service. |
| **Browser subscription in this environment** | Full Chromium 153, "new headless" | `pushManager.subscribe` failed with *"Registration failed - permission denied"*. Open-source Chromium builds lack Google's GCM keys. **Not verified** |
| **Delivery to a real device** | — | **Not verified.** Needs HTTPS deployment, VAPID keys and physical devices (see the manual protocol in `docs/device-browser-compatibility.md`) |

## Configuration

```
CALM_VAPID_PUBLIC_KEY, CALM_VAPID_PRIVATE_KEY, CALM_VAPID_SUBJECT   (npm run push:keys)
cron:  */15 * * * *  cd /srv/calm-ai && <env> npm run push:sweep
```

Push needs **HTTPS**; `localhost` is the only exception.
