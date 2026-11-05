/** Pure reminder policy for the notification bridge (unit-tested). */
export type NudgeKind = "checkin" | "radar" | "positive";
export const MAX_PER_DAY = 2;

/** Lock-screen-safe wording: never includes scores, states, tags or notes. */
export const REMINDER_TEXT: Record<NudgeKind, { title: string; body: string }> = {
  checkin: { title: "Calm", body: "A quick check-in, whenever you have a moment." },
  radar: { title: "Calm", body: "Calm noticed something worth a look. Open when it suits you." },
  positive: { title: "Calm", body: "Something good showed up in your patterns." },
};

/** Which nudges to notify now, given what was already sent today. */
export function pickReminders(nudges: { id: string; kind: NudgeKind }[], sentToday: string[], hidden: boolean) {
  if (!hidden) return []; // the person is looking at Calm already; the in-app nudge is enough
  const remaining = Math.max(0, MAX_PER_DAY - sentToday.length);
  return nudges.filter((n) => !sentToday.includes(n.id)).slice(0, remaining);
}
