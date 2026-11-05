"use client";
import { useEffect, useRef, useState } from "react";

export const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

/** Pure check, injectable for tests. */
export function prefersReducedMotion(mm: ((q: string) => { matches: boolean }) | undefined) {
  try { return !!mm?.(REDUCED_QUERY).matches; } catch { return false; }
}

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.(REDUCED_QUERY);
    if (!mq) return;
    setReduced(mq.matches);
    const on = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return reduced;
}

/** Ease a number toward `target` (count-up). Jumps straight there under reduced motion. */
export function useAnimatedNumber(target: number, ms = 900) {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (reduced || typeof requestAnimationFrame === "undefined") { setValue(target); from.current = target; return; }
    const start = performance.now(), a = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      const eased = 1 - Math.pow(1 - k, 3);
      setValue(Math.round(a + (target - a) * eased));
      if (k < 1) raf = requestAnimationFrame(tick); else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms, reduced]);
  return value;
}
