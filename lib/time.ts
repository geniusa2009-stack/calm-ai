
export const FALLBACK_TZ = "UTC";

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(tz: string) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short",
    });
    fmtCache.set(tz, f);
  }
  return f;
}

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz || tz.length > 64 || /^[+-]?\d/.test(tz)) return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; }
}

export function canonicalTimeZone(tz: unknown): string | null {
  if (!isValidTimeZone(tz)) return null;
  return new Intl.DateTimeFormat("en-US", { timeZone: tz }).resolvedOptions().timeZone;
}

export const resolveTimeZone = (saved: string | null | undefined) => canonicalTimeZone(saved) ?? FALLBACK_TZ;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface LocalParts { date: string; year: number; month: number; day: number; hour: number; minute: number; second: number; weekday: number }

export function localParts(instant: Date | string | number, tz: string): LocalParts {
  const d = instant instanceof Date ? instant : new Date(instant);
  const p: Record<string, string> = {};
  for (const x of partsFormatter(tz).formatToParts(d)) p[x.type] = x.value;
  const year = Number(p.year), month = Number(p.month), day = Number(p.day);
  return {
    year, month, day, hour: Number(p.hour), minute: Number(p.minute), second: Number(p.second),
    weekday: WEEKDAYS.indexOf(p.weekday),
    date: `${p.year}-${p.month}-${p.day}`,
  };
}

export const localDate = (instant: Date | string | number, tz: string = FALLBACK_TZ) => localParts(instant, tz).date;

export function tzOffsetMinutes(instant: Date | number, tz: string) {
  const t = instant instanceof Date ? instant.getTime() : instant;
  const p = localParts(t, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(t / 1000) * 1000) / 60000);
}

const parseDate = (date: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new RangeError(`Not a calendar date: ${date}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])] as const;
};

export function addDays(date: string, n: number) {
  const [y, m, d] = parseDate(date);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
export function daysBetween(a: string, b: string) {
  const [y1, m1, d1] = parseDate(a), [y2, m2, d2] = parseDate(b);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 864e5);
}
export function weekdayOf(date: string) {
  const [y, m, d] = parseDate(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function zonedTimeToUtc(date: string, hour: number, minute: number, tz: string): Date {
  const [y, m, d] = parseDate(date);
  const wall = Date.UTC(y, m - 1, d, hour, minute);
  const offA = tzOffsetMinutes(wall - 14 * 3600e3, tz), offB = tzOffsetMinutes(wall + 14 * 3600e3, tz);
  const candidates = [...new Set([offA, offB])]
    .map((off) => wall - off * 60e3)
    .filter((t) => { const p = localParts(t, tz); return p.date === date && p.hour === hour && p.minute === minute; })
    .sort((a, b) => a - b);
  if (candidates.length) return new Date(candidates[0]);
  return new Date(wall - Math.min(offA, offB) * 60e3);
}

export function dayLengthHours(date: string, tz: string) {
  return (zonedTimeToUtc(addDays(date, 1), 0, 0, tz).getTime() - zonedTimeToUtc(date, 0, 0, tz).getTime()) / 3600e3;
}

export const DISPLAY_LOCALE = "en-US";
export function formatInstant(instant: Date | string, tz: string, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium" }) {
  return new Intl.DateTimeFormat(DISPLAY_LOCALE, { ...opts, timeZone: tz }).format(instant instanceof Date ? instant : new Date(instant));
}
export function formatDay(date: string, opts: Intl.DateTimeFormatOptions) {
  const [y, m, d] = parseDate(date);
  return new Intl.DateTimeFormat(DISPLAY_LOCALE, { ...opts, timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

export function supportedTimeZones(): string[] {
  const fn = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
  const list = fn ? fn("timeZone") : [];
  return list.includes("UTC") ? list : ["UTC", ...list];
}
