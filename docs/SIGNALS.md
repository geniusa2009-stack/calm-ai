# Passive signals (wearables and exports)

Calm defines a provider-agnostic boundary for passive data. **No live wearable integration exists today.** This page separates what is implemented from what the architecture only supports.

## What's implemented and what isn't

| Provider | Status | What it actually does |
|---|---|---|
| **File import (JSON)** | ✅ Implemented | You upload readings you exported yourself, in the format below. Each reading is validated, normalised, de-duplicated and stored. |
| **Demo wearable** | 🧪 Demo only | Deterministic synthetic sleep, resting HR and HRV. It runs **only in demo accounts**; real accounts can't see or run it (tested). |
| Apple Health | ❌ Not implemented | HealthKit has no web API, so this needs a native iOS app that pushes to the import endpoint. |
| Health Connect | ❌ Not implemented | Needs a native Android app. |
| Oura / Fitbit | ❌ Not implemented | Would need OAuth2 with registered client credentials, a token store and scheduled pulls. |
| Garmin | ❌ Not implemented | Needs Garmin Health API partner approval. |

Providers that aren't implemented have no `fetchReadings` function and show **"Not available yet"** in Settings. A test checks they can't produce data.

## Architecture (`lib/signals/`)

```
provider (pull: fetchReadings)  ─┐
file / app (push: POST /api/signals/import) ─┤→ validate.ts → store.ts (ingest) → signal_readings
                                              │       reject with reason   upsert by (user, provider, id)
snapshot → daily.ts dailySignals() → mergeSignals(days) → engine
```

- **`types.ts`**: the `SignalProvider` interface, the `RawReading` input type (untrusted), the `Reading` canonical type, accepted units and plausible ranges.
- **`validate.ts`**:
  - Rejects bad data and gives a reason; it **never clamps** a value.
  - Rejected: unknown kinds, non-finite values, unsupported units and implausible values.
  - Also rejected: timestamps without a timezone offset, `end < start`, overlong intervals, and sleep whose duration doesn't match its interval.
  - Also rejected: future readings (more than 15 min of clock skew), readings over 2 years old, and bad offsets.
- **`store.ts`**:
  - Each batch is one transaction, capped at 5,000 readings and 2 MB.
  - **Duplicates:** uniqueness is `(user_id, provider, external_id)`. A reading without an `id` gets a content hash, so re-sending a file is a no-op.
  - **Corrections:** the same `id` with a new value updates the stored reading.
  - **Delays:** the import report includes `maxDelayHours`.
- **`daily.ts`**:
  - A pure function of the stored readings, so **out-of-order and delayed arrivals give the same result** as in-order ones (tested).
  - Sleep counts toward the day you woke up. Overlapping segments are merged, not double-counted.
  - Several providers for the same night are **not summed**: the one with the most coverage wins.
  - The device's `tzOffsetMinutes` decides the local day.
- **`providers.ts`**: the registry. **`sync.ts`** runs a pull provider and refuses anything not implemented, or demo-only for a real account.

## How signals reach the engine (deliberately conservative)

- **Sleep:** self-reported sleep always wins. Wearable sleep only **fills nights the person didn't report**.
- **No new days:** signals never create a day on their own. The engine needs a check-in.
- **Resting HR, HRV, steps:** stored, aggregated, exported and deleted with the account, but **not** used by the Pulse or Radar. Their weighting would need validating on real data first.

## Import format

```json
{
  "readings": [
    { "id": "night-2026-11-04", "kind": "sleep", "value": 435, "unit": "min",
      "start": "2026-11-03T23:15:00Z", "end": "2026-11-04T06:30:00Z", "tzOffsetMinutes": 60 },
    { "kind": "resting_hr", "value": 61, "unit": "bpm",
      "start": "2026-11-04T05:30:00Z", "end": "2026-11-04T06:30:00Z" }
  ]
}
```

| kind | accepted units | canonical | plausible range |
|---|---|---|---|
| `sleep` | `min`, `minutes`, `h`, `hours`, `s`, `seconds` | hours | 0.05–16 |
| `resting_hr` | `bpm`, `count/min` | bpm | 25–220 |
| `hrv_rmssd` | `ms`, `s` | ms | 1–300 |
| `steps` | `count`, `steps` | count | 0–100,000 |

`id` is optional but recommended. `tzOffsetMinutes` is optional; without it, readings are assigned to days in the server's local time.

## Adding a real provider

1. Implement `SignalProvider` with `status: "implemented"` and a `fetchReadings` that returns `RawReading[]`. Don't normalise inside the provider; the pipeline does that.
2. For OAuth providers, store tokens encrypted and per user, and add revocation to account deletion. That storage doesn't exist yet.
3. Add a scheduled sync. There's no job runner yet; today `POST /api/signals/sync` is the only trigger.
4. Add tests with recorded fixtures from the real API. Never call live services from tests.
