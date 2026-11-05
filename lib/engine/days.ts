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

export function localDate(d: Date | string) {
  const x = typeof d === "string" ? new Date(d) : d;
  const y = x.getFullYear(), m = String(x.getMonth() + 1).padStart(2, "0"), day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(date: string, n: number) {
  const [y, m, d] = date.split("-").map(Number);
  return localDate(new Date(y, m - 1, d + n));
}

export function daysBetween(a: string, b: string) {
  const [y1, m1, d1] = a.split("-").map(Number);
  const [y2, m2, d2] = b.split("-").map(Number);
  return Math.round((new Date(y2, m2 - 1, d2).getTime() - new Date(y1, m1 - 1, d1).getTime()) / 864e5);
}

const avgOrNull = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? mean(v) : null;
};

export function groupByDay(checkins: CheckIn[]): Day[] {
  const by = new Map<string, CheckIn[]>();
  for (const c of checkins) {
    const k = localDate(c.ts);
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
