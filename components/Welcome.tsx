"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { MODES } from "@/lib/modes";
import type { Mode } from "@/lib/types";

export function Welcome() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [mode, setMode] = useState<Mode>("everyday");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function start() {
    setBusy(true); setErr(null);
    try {
      await api("/api/settings", "POST", { onboarded: true, mode, displayName: name });
      router.push("/check-in");
      router.refresh();
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  }

  return (
    <div className="stack lg stagger" style={{ maxWidth: 640 }}>
      <div className="head page-enter">
        <span className="eyebrow">Getting started</span>
        <h1>Welcome to Calm</h1>
        <p>Calm learns what <em>your</em> usual looks like from short daily check-ins, notices when things start to drift, and suggests support that has actually worked for you. It isn&apos;t a diagnosis tool and it doesn&apos;t compare you to anyone else.</p>
      </div>
      <div className="card stack">
        <label className="field">What should Calm call you? <span className="faint">Optional</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="First name or nickname" />
        </label>
        <div className="stack" style={{ gap: 8 }}>
          <strong>What&apos;s life like right now?</strong>
          <div className="row">
            {Object.values(MODES).map((m) => (
              <button key={m.id} type="button" className={`chip ${mode === m.id ? "on" : ""}`} onClick={() => setMode(m.id)} aria-pressed={mode === m.id}>{m.label}</button>
            ))}
          </div>
          <span className="faint">{MODES[mode].description} You can change this any time.</span>
        </div>
      </div>
      <div className="card stack">
        <h2>Ready when you are</h2>
        <div className="row">
          <button className="btn big" disabled={busy} onClick={start}>Start with my first check-in</button>
        </div>
        <p className="faint">Your data is stored under your account only. You can export or delete it at any time in Settings.</p>
        {err && <div className="notice error" role="alert">{err}</div>}
      </div>
    </div>
  );
}
