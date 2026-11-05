import { snapshot } from "@/lib/snapshot";
import { CheckInForm } from "./CheckInForm";
import { round } from "@/lib/engine/stats";

export const dynamic = "force-dynamic";

export default function CheckInPage() {
  const s = snapshot();
  // Offer the person's own frequently-used tags first, then mode suggestions.
  const freq = new Map<string, number>();
  s.days.slice(-30).forEach((d) => d.tags.forEach((t) => freq.set(t, (freq.get(t) ?? 0) + 1)));
  const own = [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t).slice(0, 8);
  const suggested = [...new Set([...own, ...s.mode.suggestedTags])].slice(0, 14);
  const usualSleep = s.pulse.baseline.sleepHours.center;
  return (
    <div className="stack" style={{ maxWidth: 680 }}>
      <div className="head">
        <h1>Check in</h1>
        <p>About 20 seconds. There are no right answers. Calm compares this to <em>your</em> usual, not anyone else&apos;s.</p>
      </div>
      <CheckInForm suggestedTags={suggested} showFocus={s.mode.showFocus} alreadyToday={s.checkedInToday} defaultSleep={Math.round(round(usualSleep, 2) * 4) / 4} />
    </div>
  );
}
