import type { Day } from "../lib/engine/days";
import { addDays, localDate } from "../lib/engine/days";

/** Build `n` days ending today, with a per-day override function. */
export function makeDays(n: number, f: (i: number, daysAgo: number) => Partial<Day> = () => ({})): Day[] {
  const today = localDate(new Date());
  return Array.from({ length: n }, (_, i) => {
    const daysAgo = n - 1 - i;
    return {
      date: addDays(today, -daysAgo), stress: 4, mood: 6, energy: 6, focus: 6, sleepHours: 7, sleepQuality: 3,
      tags: [], notes: [], count: 1, ...f(i, daysAgo),
    };
  });
}
/** Small deterministic jitter so spreads aren't degenerate. */
export const wobble = (i: number) => ((i * 37) % 7) / 7 - 0.43;
