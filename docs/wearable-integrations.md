# Wearable integrations

Calm is a **web app**. Browser JavaScript **cannot** read Apple HealthKit, Android Health Connect or a wearable's sensors. Nothing here pretends otherwise.

## Provider status

Statuses use the categories defined in the brief. Each provider has exactly one.

| Provider | Status | Notes |
|---|---|---|
| File import (JSON) | **Implemented and tested** | The user uploads readings they exported. Validated, normalised and de-duplicated (`lib/signals/*`). |
| Demo wearable | **Implemented and tested** (synthetic, demo accounts only) | Labelled as demo everywhere. Real accounts can't run it (tested). |
| **Oura** | **Implemented but not externally verified** · **Blocked by credentials** | The full OAuth + sync code path is built and tested against a mock provider. The endpoints come from secondary sources, because Oura's official docs host (`cloud.ouraring.com`) wasn't reachable from the development network. It needs `OURA_CLIENT_ID`, `OURA_CLIENT_SECRET` and `CALM_TOKEN_KEY`, plus verification against the live API. |
| Fitbit | **Blocked by external approval** | Google's documentation states the legacy Fitbit Web API stopped receiving support on 30 Sep 2026 and was switched off on 2 Nov 2026 (HTTP 410). Its replacement, the Google Health API, classes every scope as *Restricted*, which requires Google's privacy and security review. No adapter was built against an API that's shut down. |
| Apple Health (HealthKit) | **Requires native application** | HealthKit is only reachable from a native iOS app with the HealthKit entitlement. |
| Android Health Connect | **Requires native application** | It needs a native Android app that declares Health Connect permissions. |
| Garmin | **Blocked by external approval** | Garmin Health API access requires partner approval. |

Sources for the Fitbit and Google Health status: [Google Health API: About](https://developers.google.com/health/about), [Fitbit legacy Web API notice](https://dev.fitbit.com/build/reference/web-api/friends/), [Fitbit community announcement](https://community.fitbit.com/t5/Web-API-Development/Introducing-the-next-phase-of-the-Fitbit-Web-API/m-p/5830905). These sources disagree on the exact switch-off date (October 30 vs. November 2, 2026); re-check them before any work.

## Architecture

```
Settings → GET /api/integrations/:p/connect        (explicit click; creates state + PKCE)
        → provider consent screen
        → GET /api/integrations/:p/callback         (session-bound; state must match THIS user)
        → token exchange (server-side) → tokens AES-256-GCM encrypted in provider_connections
POST /api/integrations/:p/sync     → accessToken() (refresh if needed) → adapter.fetchPage() × pages
                                   → normalise → lib/signals ingest (validation, dedupe, provenance)
DELETE /api/integrations/:p        → revoke at provider (best effort) → delete tokens [+ data]
```

- **`lib/integrations/oauth.ts`** is provider-agnostic. It covers the authorization-code grant, **PKCE S256**, and **state** (32 random bytes, single use, bound to user and provider, 10-minute TTL, stored only as a SHA-256 hash). It also handles token exchange, refresh with rotation, pagination capped at 50 pages, retry with backoff for 429 and 5xx (honouring `Retry-After`, max 3), a one-time refresh on 401, and the `reauth_required` state. This follows RFC 6749, RFC 7636 and RFC 9700 (OAuth 2.0 Security BCP).
- **`lib/integrations/oura.ts`** holds the endpoints, the **minimal scope (`daily`)** and a pure `normaliseOuraSleep`:
  - Sleep periods become a `sleep` segment, but only when time asleep matches the in-bed interval within 15 minutes; Calm never fabricates a segment.
  - Lowest heart rate becomes `resting_hr`, and average HRV becomes `hrv_rmssd`.
  - Offsets are kept, units are explicit, and malformed rows are counted rather than guessed.
- **`lib/secrets.ts`** is AES-256-GCM with a random IV per value, keyed by `CALM_TOKEN_KEY`, which lives only on the server.
- **Provenance:** every reading keeps `provider` and the source record id. Imported, provider-synced, manual and demo data stay distinguishable.
- **Calm Pulse is unaffected:** HR, HRV and steps are stored and exported but not used by the Pulse or Radar. Wearable sleep only fills nights that have no self-reported sleep. There's no validated method for anything more.

## Security & privacy

- Tokens are never sent to the browser, never kept in `localStorage`, never logged and never exported (tested).
- The client secret stays server-side. It never appears in the authorize URL (tested).
- A callback carrying **another user's state** is refused (tested). That prevents OAuth login-CSRF and account mix-ups.
- The redirect URI comes from `CALM_PUBLIC_URL`, not the `Host` header.
- Disconnect revokes at the provider and deletes tokens; optionally it also deletes the imported data. **Account deletion revokes all grants, and only after the password check** (tested).
- Errors are stored as short codes (`http_503`), never provider payloads.
- Manual sync is rate-limited to one per user per 5 minutes.

## Native companion contract (HealthKit / Health Connect)

A future native app would:
1. Request **read-only** permission for sleep analysis, resting heart rate, HRV (SDNN on iOS) and step count, nothing else.
2. Authenticate the user with Calm. **This needs new work:** a device token or OAuth for first-party apps, because today's session cookie is web-only.
3. `POST /api/signals/import` with the existing format (`docs/SIGNALS.md`): stable `id` per sample (the HealthKit sample UUID or Health Connect record id), `timeZone` (IANA, from the device), and an explicit unit.
4. Sync incrementally using platform anchors or change tokens. Corrections reuse the same `id`, and the server treats them as updates.

**Not built yet:** native app projects, device auth, the iOS SDNN-to-RMSSD question (HealthKit reports SDNN, a different HRV metric, which **must not** be stored as `hrv_rmssd`), and App Store / Play review.

## To enable Oura

1. Create an app in the Oura developer portal and register the redirect `${CALM_PUBLIC_URL}/api/integrations/oura/callback`.
2. Set `OURA_CLIENT_ID`, `OURA_CLIENT_SECRET`, `CALM_TOKEN_KEY` and `CALM_PUBLIC_URL`.
3. Using Oura's current official docs, verify the authorize, token and revoke URLs, the scope name `daily`, PKCE support, and the field names `bedtime_start`, `bedtime_end`, `total_sleep_duration`, `lowest_heart_rate`, `average_hrv` and `next_token`.
4. Connect a test account and compare imported nights with the Oura app. Only then set `externallyVerified: true`.

## Tests

`tests/integrations.test.ts` (14 tests) runs against an in-process mock provider. It covers configuration gating, encryption, the authorize URL, PKCE, state (single use, cross-user, expiry), refresh and rotation, refresh rejection, pagination and idempotent re-sync, 429/401/5xx handling, disconnect and isolation, deletion-time revocation, token-free export, the cross-user callback, and normalisation.
