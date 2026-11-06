# Timezone architecture

## Rules

| Concept | Representation | Where it's used |
|---|---|---|
| **Instant** | UTC ISO-8601 string (`2026-11-05T21:30:00.000Z`) | Every stored timestamp and API exchange: check-ins, sessions, readings, sessions/tokens |
| **User zone** | IANA id in `settings.timezone` (`Africa/Cairo`). **Never a fixed offset.** `""` means not set, and UTC is used until it is | Deciding "today", the hour (quiet hours, evening ranking, greeting), reminder scheduling |
| **Recorded zone** | IANA id on each check-in and support session (`checkins.tz`, `support_sessions.tz`, migration v4) | Which local day that entry belongs to, permanently |
| **Calendar date** | `YYYY-MM-DD`, no zone | Days, baselines, radar windows, weekly insights, recovery episodes, charts |

- **No server timezone, ever.** `lib/time.ts` takes the zone as an argument everywhere, and its default is UTC. `npm run test:tz` runs the whole suite with the server in UTC, Cairo, Los Angeles and UTC+14, and it passes in all of them.
- **Calendar maths** (`addDays`, `daysBetween`, `weekdayOf`, ISO weeks) works on the date alone, in UTC. That makes a 23-hour or 25-hour DST day exactly one day from its neighbours, and a week always seven dates.
- **Durations** (sleep, sessions) are always computed from instants, so a night that crosses DST has its real elapsed length (9 hours across the 25-hour London night, tested).
- **Wall-clock to instant** (`zonedTimeToUtc`, used for demo seeding and scheduling) is deterministic. A time in a DST gap resolves to just after the gap (02:30 becomes 03:30). An ambiguous time resolves to the earlier instant.
- **Display:** `formatInstant` and `formatDay` use a fixed locale (`en-US`) and an explicit zone, so server and browser render identical text with no hydration mismatch. Instants on client components are formatted with the user's zone, passed in as a prop.

## Which zone applies, operation by operation

| Operation | Basis |
|---|---|
| Grouping check-ins into days | Each check-in's **recorded zone**; legacy rows (no zone) use the user's current zone |
| Support sessions in recovery episodes | Each session's recorded zone, with the same fallback |
| "Today", radar windows, weekly insights, the what-if 14-day window | The user's current zone |
| Weekday patterns, the weekly insight "best day" | Calendar date (zone already applied) |
| Quiet hours, evening tool ranking, greeting | The user's local hour (`localParts(now, tz).hour`) |
| Wearable readings | The reading's own `timeZone` (IANA, converted to the offset in force at `end`) or `tzOffsetMinutes`; otherwise the user's zone. Sleep counts toward the **local wake-up date** |
| Personal baseline / Pulse | Calendar dates only (no zone arithmetic) |
| Reminder scheduling (push) | The user's zone at the moment of sending; see `docs/push-notifications.md` |

## Setting and changing the zone

1. At **sign-up** (and demo start), the browser's `Intl` zone is saved.
2. At **sign-in**, or on first load (`TimezoneSync`), a detected zone is saved **only if none is set**.
3. If the device later reports a **different** zone (travel), Today asks: "Use X" or "Keep Y". Calm never changes a saved zone silently. "Keep" is remembered on that device for that zone.
4. **Settings → You → Time zone** offers the full IANA list plus "Use this device's time zone".
5. Changing the zone never re-dates past entries, because each keeps its recorded zone. Only legacy rows (made before v4) follow the current zone; this is the one documented exception.

## Validation

- Zones must be IANA ids that the runtime knows. Offsets like `+02:00`, `GMT+2` or digits are rejected with a 400.
- Spelling is canonicalised (`africa/cairo` becomes `Africa/Cairo`).
- Wearable readings must carry timestamps with an explicit offset or `Z`. If `timeZone` and `tzOffsetMinutes` disagree, the reading is rejected.

## Tests

`tests/timezone.test.ts` uses fixed instants only. It covers:
- UTC vs. local time across six zones;
- the offsets of Cairo, Kolkata (+5:30), Kathmandu (+5:45) and Lord Howe (30-minute DST);
- 23- and 25-hour days in New York, London and Cairo;
- DST gaps and overlaps;
- leap years;
- weekday and ISO week (including week 53);
- deterministic formatting;
- the midnight boundary;
- travel and legacy rows;
- a 10-day history across DST;
- Pulse "today", and evening ranking;
- cross-midnight sleep, and sleep across DST;
- the missing-zone fallback;
- storage plus quiet hours, end to end;
- settings validation.

The same suite also runs under four server timezones (`npm run test:tz`).
