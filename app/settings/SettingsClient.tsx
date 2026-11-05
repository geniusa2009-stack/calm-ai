"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { MODES } from "@/lib/modes";
import { REGIONS } from "@/lib/safety";
import type { Settings } from "@/lib/types";

export function SettingsClient({ settings, configured, hasDemo }: { settings: Settings; configured: boolean; hasDemo: boolean }) {
  const router = useRouter();
  const [s, setS] = useState(settings);
  const [status, setStatus] = useState<string | null>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);

  async function update(p: Partial<Settings>) {
    setS({ ...s, ...p });
    try { await api("/api/settings", "POST", p); setStatus("Saved"); router.refresh(); } catch (e) { setStatus((e as Error).message); }
    setTimeout(() => setStatus(null), 1500);
  }
  const hours = Array.from({ length: 24 }, (_, h) => h);

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div aria-live="polite" className="faint" style={{ minHeight: "1.2em" }}>{status}</div>

      <section className="card stack">
        <h2>Mode</h2>
        <div className="row">
          {Object.values(MODES).map((m) => <button key={m.id} className={`chip ${s.mode === m.id ? "on" : ""}`} aria-pressed={s.mode === m.id} onClick={() => update({ mode: m.id })}>{m.label}</button>)}
        </div>
        <span className="muted">{MODES[s.mode].description}</span>
      </section>

      <section className="card stack">
        <h2>You</h2>
        <label className="field">Name<input type="text" defaultValue={s.displayName} maxLength={40} onBlur={(e) => e.target.value !== s.displayName && update({ displayName: e.target.value })} /></label>
        <label className="field">Region <span className="faint">for crisis resources</span>
          <select value={s.region} onChange={(e) => update({ region: e.target.value })}>{REGIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </label>
      </section>

      <section className="card stack">
        <h2>Nudges</h2>
        <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={s.nudgesEnabled} onChange={(e) => update({ nudgesEnabled: e.target.checked })} /> Show gentle nudges on the Today screen</label>
        <div className="row">
          <label className="field">Quiet from<select value={s.quietStart} onChange={(e) => update({ quietStart: Number(e.target.value) })}>{hours.map((h) => <option key={h} value={h}>{h}:00</option>)}</select></label>
          <label className="field">until<select value={s.quietEnd} onChange={(e) => update({ quietEnd: Number(e.target.value) })}>{hours.map((h) => <option key={h} value={h}>{h}:00</option>)}</select></label>
        </div>
        <span className="faint">{MODES[s.mode].label} mode shows at most {MODES[s.mode].nudgesPerDay} nudge{MODES[s.mode].nudgesPerDay > 1 ? "s" : ""} at a time.</span>
      </section>

      <section className="card stack">
        <h2>AI companion</h2>
        <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={s.companionEnabled} onChange={(e) => update({ companionEnabled: e.target.checked })} /> Enable the companion</label>
        <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={s.companionUsesContext} disabled={!s.companionEnabled} onChange={(e) => update({ companionUsesContext: e.target.checked })} /> Let it see a summary of my patterns and pinned memories</label>
        <span className="faint">{configured ? "Connected to Claude via the server's API key. Messages are sent to Anthropic to generate replies." : "Not configured: set ANTHROPIC_API_KEY on the server to enable replies. Safety support works regardless."}</span>
      </section>

      <section className="card stack" id="data">
        <h2>Your data</h2>
        <p className="muted">Everything is stored in this app&apos;s local SQLite database. Nothing is shared unless you use the companion (which sends your messages, and optionally a summary, to the AI provider) or export it yourself.</p>
        <div className="row">
          <a className="btn ghost" href="/api/export">Export everything (JSON)</a>
          <button className="btn ghost" onClick={async () => { await api("/api/demo", "POST", { mode: s.mode }); router.push("/"); router.refresh(); }}>{hasDemo ? "Reload demo data" : "Load demo data"}</button>
        </div>
        {!confirmWipe ? <div><button className="btn danger" onClick={() => setConfirmWipe(true)}>{hasDemo ? "Clear demo data and start fresh" : "Delete all my data"}</button></div> : (
          <div className="row">
            <span>This permanently deletes all check-ins, sessions, memories, circle and settings.</span>
            <button className="btn danger" onClick={async () => { await api("/api/reset", "POST"); router.push("/"); router.refresh(); }}>Yes, delete everything</button>
            <button className="btn ghost" onClick={() => setConfirmWipe(false)}>Cancel</button>
          </div>
        )}
      </section>
    </div>
  );
}
