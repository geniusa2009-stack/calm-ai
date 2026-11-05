"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { MODES } from "@/lib/modes";
import { REGIONS } from "@/lib/safety";
import type { Settings } from "@/lib/types";

export function SettingsClient({ settings, configured, isDemo, email }: { settings: Settings; configured: boolean; isDemo: boolean; email: string | null }) {
  const router = useRouter();
  const [s, setS] = useState(settings);
  const [status, setStatus] = useState<string | null>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pw, setPw] = useState("");
  const [pwCur, setPwCur] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [acctMsg, setAcctMsg] = useState<string | null>(null);

  async function signOut() { await api("/api/auth/logout", "POST"); router.push("/login"); router.refresh(); }

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
        <p className="muted">Your data is stored in this app&apos;s database, under your account only. Nothing is shared unless you use the companion (which sends your messages, and optionally a summary, to the AI provider) or export it yourself.</p>
        <div className="row">
          <a className="btn ghost" href="/api/export">Export everything (JSON)</a>
          {isDemo && <button className="btn ghost" onClick={async () => { await api("/api/demo", "POST", { mode: s.mode }); router.push("/"); router.refresh(); }}>Reset demo data</button>}
        </div>
        {!confirmWipe ? <div><button className="btn danger" onClick={() => setConfirmWipe(true)}>Delete all my wellbeing data</button></div> : (
          <div className="row">
            <span>This permanently deletes all check-ins, sessions, memories, circle, companion history and settings. Your account stays.</span>
            <button className="btn danger" onClick={async () => { await api("/api/reset", "POST"); router.push("/"); router.refresh(); }}>Yes, delete my data</button>
            <button className="btn ghost" onClick={() => setConfirmWipe(false)}>Cancel</button>
          </div>
        )}
      </section>

      <section className="card stack" id="account">
        <h2>Account</h2>
        {isDemo
          ? <p className="muted">This is a temporary demo account. It and its data are deleted automatically within 48 hours. <a href="/login?mode=register" onClick={(e) => { e.preventDefault(); api("/api/auth/logout", "POST").then(() => { router.push("/login?mode=register"); router.refresh(); }); }}>Create a real account</a> to keep your own data.</p>
          : <p className="muted">Signed in as <strong>{email}</strong>.</p>}
        <div><button className="btn ghost" onClick={signOut}>Sign out</button></div>
        {!isDemo && (
          <form className="stack" onSubmit={async (e) => {
            e.preventDefault(); setAcctMsg(null);
            try { await api("/api/auth/password", "POST", { current: pwCur, next: pwNew }); setPwCur(""); setPwNew(""); setAcctMsg("Password changed. Other devices were signed out."); }
            catch (err) { setAcctMsg((err as Error).message); }
          }}>
            <strong>Change password</strong>
            <div className="row">
              <label className="field" style={{ flex: 1, minWidth: 180 }}>Current<input type="password" autoComplete="current-password" value={pwCur} onChange={(e) => setPwCur(e.target.value)} /></label>
              <label className="field" style={{ flex: 1, minWidth: 180 }}>New (10+ characters)<input type="password" autoComplete="new-password" value={pwNew} onChange={(e) => setPwNew(e.target.value)} /></label>
            </div>
            <div><button className="btn ghost" disabled={!pwCur || pwNew.length < 10}>Change password</button></div>
          </form>
        )}
        {acctMsg && <p aria-live="polite" className="faint">{acctMsg}</p>}
        {!deleting ? <div><button className="btn danger" onClick={() => setDeleting(true)}>Delete my account</button></div> : (
          <form className="stack" onSubmit={async (e) => {
            e.preventDefault(); setAcctMsg(null);
            try { await api("/api/account", "DELETE", { password: pw }); router.push("/login"); router.refresh(); }
            catch (err) { setAcctMsg((err as Error).message); }
          }}>
            <span>This permanently deletes your account and everything in it. It can&apos;t be undone. Consider exporting first.</span>
            {!isDemo && <label className="field">Confirm with your password<input type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} /></label>}
            <div className="row">
              <button className="btn danger" disabled={!isDemo && !pw}>Delete account permanently</button>
              <button type="button" className="btn ghost" onClick={() => setDeleting(false)}>Cancel</button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
