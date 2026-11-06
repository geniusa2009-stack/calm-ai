import type { CheckIn } from "../types";
import { mean } from "./stats";

/** One calendar day, aggregated from one or more check-ins. */
export interface Day {
  date: string; // YYYY-MM-DD (local)
  stress: number;
  mood: number;
  energy: number;
  focus: number | null;
  sleepHours: number | null; // sleep the night before this day
  sleepQuality: number | null;
  tags: string[];
  notes: string[];
  count: number;
}

// Calendar helpers live in lib/time.ts (zone-explicit, DST-safe). Re-exported for existing callers.
export { localDate, addDays, daysBetween, weekdayOf } from "../time";
import { localDate, FALLBACK_TZ } from "../time";

const avgOrNull = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? mean(v) : null;
};

/**
 * Group check-ins into local calendar days. Each check-in is dated in the zone it was
 * RECORDED in (`c.tz`), so travelling never moves past entries to a different day.
 * Legacy rows without a zone use `fallbackTz` (the user's current zone).
 */
export function groupByDay(checkins: CheckIn[], fallbackTz: string = FALLBACK_TZ): Day[] {
  const by = new Map<string, CheckIn[]>();
  for (const c of checkins) {
    const k = localDate(c.ts, c.tz ?? fallbackTz);
    (by.get(k) ?? by.set(k, []).get(k)!).push(c);
  }
  return [...by.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, cs]) => ({
      date,
      stress: mean(cs.map((c) => c.stress)),
      mood: mean(cs.map((c) => c.mood)),
      energy: mean(cs.map((c) => c.energy)),
      focus: avgOrNull(cs.map((c) => c.focus)),
      // sleep is reported once per day; take the first non-null report
      sleepHours: cs.find((c) => c.sleepHours != null)?.sleepHours ?? null,
      sleepQuality: cs.find((c) => c.sleepQuality != null)?.sleepQuality ?? null,
      tags: [...new Set(cs.flatMap((c) => c.tags))],
      notes: cs.map((c) => c.note).filter((n): n is string => !!n),
      count: cs.length,
    }));
}
