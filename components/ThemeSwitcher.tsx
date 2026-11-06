"use client";
import { useState } from "react";
import { THEME_COOKIE } from "@/lib/theme";
import type { ThemePref } from "@/lib/types";

const OPTIONS: { id: ThemePref; label: string; hint: string }[] = [
  { id: "light", label: "Light", hint: "Calm's original palette" },
  { id: "dark", label: "Dark", hint: "Easier on the eyes at night" },
  { id: "system", label: "System", hint: "Follow this device's setting" },
];

/** Apply a theme instantly (no reload) with a short colour cross-fade, and remember it. */
export function applyTheme(t: ThemePref) {
  const root = document.documentElement;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (!reduce) {
    root.classList.add("theme-switching");
    window.setTimeout(() => root.classList.remove("theme-switching"), 450);
  }
  if (t === "system") delete root.dataset.theme; else root.dataset.theme = t;
  // 1 year; Lax; readable by the server so the next page render uses the same theme.
  document.cookie = `${THEME_COOKIE}=${t}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

export function ThemeSwitcher({ initial, signedIn = true }: { initial: ThemePref; signedIn?: boolean }) {
  const [value, setValue] = useState<ThemePref>(initial);
  const [error, setError] = useState<string | null>(null);

  async function choose(t: ThemePref) {
    setValue(t);
    setError(null);
    applyTheme(t);
    if (!signedIn) return;
    try {
      const res = await fetch("/api/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ theme: t }) });
      if (!res.ok) throw new Error();
    } catch {
      setError("Applied on this device, but couldn't save it to your account. It will still be remembered here.");
    }
  }

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="segmented" role="radiogroup" aria-label="Theme">
        {OPTIONS.map((o) => (
          <label key={o.id} className={`segment ${value === o.id ? "on" : ""}`}>
            <input type="radio" name="theme" value={o.id} checked={value === o.id} onChange={() => choose(o.id)} />
            <span className="segment-label">{o.label}</span>
            <span className="segment-hint">{o.hint}</span>
          </label>
        ))}
      </div>
      {error && <div className="notice warn" role="status">{error}</div>}
    </div>
  );
}
