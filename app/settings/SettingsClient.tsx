"use client";
import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { api, detectedTimeZone } from "@/lib/client";
import { MODES } from "@/lib/modes";
import { REGIONS } from "@/lib/safety";
import { Dialog } from "@/components/ui/Dialog";
import { Notice } from "@/components/ui";
import type { Settings } from "@/lib/types";

export function SettingsClient({ settings, configured, isDemo, email, deviceSlot, signalsSlot, zones = [] }: {
  settings: Settings; configured: boolean; isDemo: boolean; email: string | null; deviceSlot?: ReactNode; signalsSlot?: ReactNode; zones?: string[];
}) {
  const router = useRouter();
  const [s, setS] = useState(settings);
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);
  const [wipeOpen, setWipeOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [pwCur, setPwCur] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [acctMsg, setAcctMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [dangerErr, setDangerErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signOut() { await api("/api/auth/logout", "POST"); router.push("/login"); router.refresh(); }

  async function update(p: Partial<Settings>) {
    const prev = s;
    setS({ ...s, ...p });
    try { await api("/api/settings", "POST", p); setStatus({ text: "Saved" }); router.refresh(); }
    catch (e) { setS(prev); setStatus({ text: (e as Error).message, error: true }); }
    setTimeout(() => setStatus(null), 1800);
  }
  const hours = Array.from({ length: 24 }, (_, h) => h);

  return (
    <div className="stack lg">
      <div aria-live="polite" className="toast-region">{status && <div className={`toast ${status.error ? "error" : ""}`}>{status.text}</div>}</div>

      <section className="card stack" id="mode" aria-labelledby="mode-h">
        <h2 id="mode-h">Mode</h2>
        <div className="row" role="group" aria-label="Mode">
          {Object.values(MODES).map((m) => <button key={m.id} className={`chip ${s.mode === m.id ? "on" : ""}`} aria-pressed={s.mode === m.id} onClick={() => update({ mode: m.id })}>{m.label}</button>)}
        </div>
        <span key={s.mode} className="muted fade-swap">{MODES[s.mode].description}</span>
      </section>

      <section className="card stack" id="you" aria-labelledby="you-h">
        <h2 id="you-h">You</h2>
        <label className="field">Name<input type="text" defaultValue={s.displayName} maxLength={40} onBlur={(e) => e.target.value !== s.displayName && update({ displayName: e.target.value })} /></label>
        <label className="field">Region <span className="faint">Used only to show the right crisis lines</span>
          <select value={s.region} onChange={(e) => update({ region: e.target.value })}>{REGIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </label>
        <label className="field">Time zone <span className="faint">Decides which day each check-in counts towards, and when reminders and quiet hours apply. Past check-ins keep the zone they were made in.</span>
          <select value={s.timezone || "UTC"} onChange={(e) => update({ timezone: e.target.value })}>
            {!s.timezone && <option value="UTC">Not set yet — using UTC</option>}
            {zones.map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
          </select>
        </label>
        <div><button type="button" className="btn ghost small" onClick={() => { const d = detectedTimeZone(); if (d) update({ timezone: d }); }}>Use this device&apos;s time zone</button></div>
      </section>

      <section className="card stack" id="nudges" aria-labelledby="nudges-h">
        <h2 id="nudges-h">Nudges</h2>
        <label className="switch"><input type="checkbox" role="switch" checked={s.nudgesEnabled} onChange={(e) => update({ nudgesEnabled: e.target.checked })} /> Show gentle nudges on the Today screen</label>
        <div className="row">
          <label className="field">Quiet from<select value={s.quietStart} onChange={(e) => update({ quietStart: Number(e.target.value) })}>{hours.map((h) => <option key={h} value={h}>{h}:00</option>)}</select></label>
          <label className="field">until<select value={s.quietEnd} onChange={(e) => update({ quietEnd: Number(e.target.value) })}>{hours.map((h) => <option key={h} value={h}>{h}:00</option>)}</select></label>
        </div>
        <span className="faint">{MODES[s.mode].label} mode shows at most {MODES[s.mode].nudgesPerDay} nudge{MODES[s.mode].nudgesPerDay > 1 ? "s" : ""} at a time. Quiet hours also apply to reminders.</span>
      </section>

      {deviceSlot}

      <section className="card stack" id="companion" aria-labelledby="companion-h">
        <h2 id="companion-h">AI companion</h2>
        <label className="switch"><input type="checkbox" role="switch" checked={s.companionEnabled} onChange={(e) => update({ companionEnabled: e.target.checked })} /> Enable the companion</label>
        <label className="switch"><input type="checkbox" role="switch" checked={s.companionUsesContext} disabled={!s.companionEnabled} onChange={(e) => update({ companionUsesContext: e.target.checked })} /> Let it see a summary of my patterns and pinned memories</label>
        <span className="faint">{configured ? "Connected to Claude via the server's API key. Messages are sent to Anthropic to generate replies." : "Not configured: set ANTHROPIC_API_KEY on the server to enable replies. Safety support works regardless."}</span>
      </section>

      {signalsSlot}

      <section className="card stack" id="data" aria-labelledby="data-h">
        <h2 id="data-h">Your data</h2>
        <p className="muted">Your data is stored in this app&apos;s database, under your account only. Nothing is shared unless you use the companion (which sends your messages, and optionally a summary, to the AI provider) or export it yourself.</p>
        <div className="row">
          <a className="btn ghost" href="/api/export">Export everything (JSON)</a>
          {isDemo && <button className="btn ghost" onClick={async () => { await api("/api/demo", "POST", { mode: s.mode }); router.push("/"); router.refresh(); }}>Reset demo data</button>}
          <button className="btn quiet" style={{ color: "var(--strain)" }} onClick={() => { setDangerErr(null); setWipeOpen(true); }}>Delete all my wellbeing data…</button>
        </div>
      </section>

      <section className="card stack" id="account" aria-labelledby="account-h">
        <h2 id="account-h">Account</h2>
        {isDemo
          ? <p className="muted">This is a temporary demo account. It and its data are deleted automatically within 48 hours. <a href="/login?mode=register" onClick={(e) => { e.preventDefault(); api("/api/auth/logout", "POST").then(() => { router.push("/login?mode=register"); router.refresh(); }); }}>Create a real account</a> to keep your own data.</p>
          : <p className="muted">Signed in as <strong>{email}</strong>.</p>}
        <div><button className="btn ghost" onClick={signOut}>Sign out</button></div>
        {!isDemo && (
          <form className="stack" onSubmit={async (e) => {
            e.preventDefault(); setAcctMsg(null);
            try { await api("/api/auth/password", "POST", { current: pwCur, next: pwNew }); setPwCur(""); setPwNew(""); setAcctMsg({ text: "Password changed. Other devices were signed out." }); }
            catch (err) { setAcctMsg({ text: (err as Error).message, error: true }); }
          }}>
            <hr className="divider" />
            <strong>Change password</strong>
            <div className="row">
              <label className="field" style={{ flex: 1, minWidth: 180 }}>Current<input type="password" autoComplete="current-password" value={pwCur} onChange={(e) => setPwCur(e.target.value)} /></label>
              <label className="field" style={{ flex: 1, minWidth: 180 }}>New (10+ characters)<input type="password" autoComplete="new-password" value={pwNew} onChange={(e) => setPwNew(e.target.value)} /></label>
            </div>
            <div><button className="btn ghost" disabled={!pwCur || pwNew.length < 10}>Change password</button></div>
          </form>
        )}
        {acctMsg && <Notice tone={acctMsg.error ? "error" : "success"}>{acctMsg.text}</Notice>}
        <hr className="divider" />
        <div><button className="btn quiet" style={{ color: "var(--strain)" }} onClick={() => { setPw(""); setDangerErr(null); setDeleteOpen(true); }}>Delete my account…</button></div>
      </section>

      <Dialog open={wipeOpen} onClose={() => setWipeOpen(false)} title="Delete all your wellbeing data?" describedBy="wipe-desc">
        <p id="wipe-desc" className="muted" style={{ margin: 0 }}>This permanently deletes every check-in, support session, memory, circle contact, companion message, imported reading and setting. Your account stays. This can&apos;t be undone — consider exporting first.</p>
        {dangerErr && <Notice tone="error">{dangerErr}</Notice>}
        <div className="row">
          <button className="btn danger" disabled={busy} onClick={async () => {
            setBusy(true);
            try { await api("/api/reset", "POST"); setWipeOpen(false); router.push("/"); router.refresh(); }
            catch (e) { setDangerErr((e as Error).message); }
            setBusy(false);
          }}>{busy ? "Deleting…" : "Delete my data"}</button>
          <button className="btn ghost" onClick={() => setWipeOpen(false)}>Cancel</button>
        </div>
      </Dialog>

      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete your account?" describedBy="del-desc">
        <form className="stack" onSubmit={async (e) => {
          e.preventDefault(); setBusy(true); setDangerErr(null);
          try { await api("/api/account", "DELETE", { password: pw }); router.push("/login"); router.refresh(); }
          catch (err) { setDangerErr((err as Error).message); }
          setBusy(false);
        }}>
          <p id="del-desc" className="muted" style={{ margin: 0 }}>Your account and everything in it are deleted permanently and you&apos;ll be signed out everywhere. This can&apos;t be undone.</p>
          {!isDemo && <label className="field">Confirm with your password<input type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus /></label>}
          {dangerErr && <Notice tone="error">{dangerErr}</Notice>}
          <div className="row">
            <button className="btn danger" disabled={busy || (!isDemo && !pw)}>{busy ? "Deleting…" : "Delete account permanently"}</button>
            <button type="button" className="btn ghost" onClick={() => setDeleteOpen(false)}>Cancel</button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
