"use client";
import { useEffect, useState } from "react";
import type { PulseState } from "@/lib/engine/pulse";
import { useAnimatedNumber } from "@/lib/motion";

const COLOR: Record<PulseState, string> = {
  learning: "var(--ink-3)", "no-recent": "var(--ink-3)", bright: "var(--bright)", steady: "var(--calm)", stretched: "var(--stretch)",
  strained: "var(--strain)", "running-low": "var(--low)", recovering: "var(--calm)",
};

/**
 * Calm Pulse gauge. The arc and number ease to new values; colour cross-fades between
 * states. Under prefers-reduced-motion both jump straight to the final state.
 * The tick marks "your usual" (60).
 */
export function PulseRing({ score, state, size = 200, label }: { score: number; state: PulseState; size?: number; label?: string }) {
  const r = size / 2 - 14, c = size / 2;
  const start = 135, sweep = 270;
  const pt = (deg: number, rad = r) => { const a = (deg * Math.PI) / 180; return [c + rad * Math.cos(a), c + rad * Math.sin(a)]; };
  const [x1, y1] = pt(start), [x2, y2] = pt(start + sweep);
  const track = `M ${x1} ${y1} A ${r} ${r} 0 1 1 ${x2} ${y2}`;
  const usual = start + sweep * 0.6;
  const [ux1, uy1] = pt(usual, r - 12), [ux2, uy2] = pt(usual, r + 12);
  const quiet = state === "learning" || state === "no-recent";

  // Start from empty on first paint so the arc draws in; subsequent changes ease from the last value.
  const [target, setTarget] = useState(0);
  useEffect(() => { setTarget(quiet ? 0 : Math.max(1, score)); }, [score, quiet]);
  const shown = useAnimatedNumber(quiet ? 0 : score);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img"
      aria-label={quiet ? `Calm Pulse: ${label ?? "not enough recent data"}` : `Calm Pulse ${score} out of 100 — ${label ?? state}. 60 is your usual.`}
      className="pulse-ring">
      <path d={track} stroke="var(--surface-3)" strokeWidth={14} fill="none" strokeLinecap="round" />
      <path d={track} pathLength={100} stroke={COLOR[state]} strokeWidth={14} fill="none" strokeLinecap="round"
        style={{ strokeDasharray: `${target} 100`, transition: "stroke-dasharray var(--dur-pulse) var(--ease), stroke var(--dur-slow) var(--ease)", opacity: quiet ? 0 : 1 }} />
      <line x1={ux1} y1={uy1} x2={ux2} y2={uy2} stroke="var(--ink-3)" strokeWidth={2} strokeLinecap="round" />
      <text x={c} y={c + 6} textAnchor="middle" fontSize={size * 0.24} fontWeight={700} fill="var(--ink)" style={{ fontVariantNumeric: "tabular-nums" }}>{quiet ? "·" : shown}</text>
      <text x={c} y={c + size * 0.18} textAnchor="middle" fontSize={11} fill="var(--ink-3)">{state === "learning" ? "learning" : state === "no-recent" ? "no recent data" : "tick = your usual"}</text>
    </svg>
  );
}
