"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { Notice } from "@/components/ui";
import {
  acquireWakeLock, HEALTH_NOTE, NOT_USED, notificationState, outcomeMessage, requestNotifications, tap,
  vibrationState, wakeLockState, type RequestOutcome,
} from "@/lib/device/capabilities";

type StepId = "intro" | "notifications" | "screen" | "haptics" | "health" | "done";
const STEPS: StepId[] = ["intro", "notifications", "screen", "haptics", "health", "done"];
const CAP_STEPS = STEPS.filter((s) => s !== "intro" && s !== "done");

interface Result { tone: "success" | "info" | "warn" | "error"; title: string; body: string }

function Facts({ enables, why, data }: { enables: string; why: string; data: string }) {
  return (
    <dl className="facts">
      <div><dt>What it enables</dt><dd>{enables}</dd></div>
      <div><dt>Why Calm asks</dt><dd>{why}</dd></div>
      <div><dt>What&apos;s accessed</dt><dd>{data}</dd></div>
    </dl>
  );
}

export function DeviceSetupFlow({ initialStep, prefs }: { initialStep: number; prefs: { notifyEnabled: boolean; wakeLockEnabled: boolean; hapticsEnabled: boolean } }) {
  const router = useRouter();
  const [i, setI] = useState(Math.min(Math.max(0, initialStep), STEPS.length - 1));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [on, setOn] = useState(prefs);
  // Capability support is read after mount (never during SSR) — reading it never prompts.
  const [support, setSupport] = useState<{ notif: string; wake: string; vib: string } | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const step = STEPS[i];

  useEffect(() => { setSupport({ notif: notificationState(), wake: wakeLockState(), vib: vibrationState() }); }, []);
  // Move focus to the new step's heading so screen reader and keyboard users follow along.
  useEffect(() => { if (i > 0) headingRef.current?.focus(); }, [i]);

  const save = (p: object) => api("/api/settings", "POST", p).catch(() => { /* non-blocking: progress save is best effort */ });

  function go(next: number) {
    setResult(null);
    setI(next);
    save({ deviceStep: next, deviceSetup: STEPS[next] === "done" ? "done" : "in-progress" });
  }
  const advance = () => go(i + 1);

  async function skipAll() {
    await save({ deviceSetup: "skipped", deviceStep: i });
    router.push("/"); router.refresh();
  }

  async function enableNotifications() {
    setBusy(true);
    const { outcome } = await requestNotifications(); // the ONLY place a prompt can appear, after the click
    const granted = outcome === "granted" || outcome === "already-granted";
    if (granted !== on.notifyEnabled) { setOn({ ...on, notifyEnabled: granted }); await save({ notifyEnabled: granted }); }
    setSupport((s) => s && { ...s, notif: notificationState() });
    setResult(outcomeMessage(outcome as RequestOutcome));
    setBusy(false);
  }

  async function enableScreen() {
    setBusy(true);
    const r = await acquireWakeLock(); // verify it works, then release; it's only held during sessions
    if (r.ok) {
      await r.sentinel.release().catch(() => {});
      setOn({ ...on, wakeLockEnabled: true }); await save({ wakeLockEnabled: true });
      setResult({ tone: "success", title: "Screen will stay on during sessions", body: "Only while a breathing, grounding or soundscape session is running. It's released as soon as you finish or leave." });
    } else {
      setResult(r.reason === "unsupported"
        ? { tone: "warn", title: "Not available in this browser", body: "Your screen may dim during long sessions. You can keep going without it." }
        : { tone: "warn", title: "The browser declined", body: "This can happen on low battery or power-saving mode. Calm will try again when a session starts if you enable it in Settings." });
    }
    setBusy(false);
  }

  async function enableHaptics() {
    setBusy(true);
    const ok = tap(undefined, [30, 80, 30]);
    if (vibrationState() === "available") {
      setOn({ ...on, hapticsEnabled: true }); await save({ hapticsEnabled: true });
      setResult({ tone: "success", title: ok ? "Gentle taps are on" : "Turned on", body: "You'll feel a short tap when a breathing phase changes. If you didn't feel anything just now, your device may have vibration turned off." });
    } else {
      setResult({ tone: "warn", title: "Not available on this device", body: "This browser has no vibration support (for example, Safari on iPhone). Visual and on-screen cues work the same." });
    }
    setBusy(false);
  }

  const capIndex = CAP_STEPS.indexOf(step as (typeof CAP_STEPS)[number]);
  const pct = step === "intro" ? 0 : step === "done" ? 100 : ((capIndex + 1) / (CAP_STEPS.length + 1)) * 100;
  const supportLabel = (s?: string) => (s === undefined ? "Checking…" : s === "unsupported" || s === "insecure" ? "Not supported in this browser" : "Supported");

  return (
    <div className="setup">
      <div className="row between" style={{ marginBottom: 16 }}>
        <span className="faint" aria-live="polite">{step === "intro" ? "Optional setup" : step === "done" ? "All set" : `Step ${capIndex + 1} of ${CAP_STEPS.length}`}</span>
        {step !== "done" && <button className="btn quiet small" onClick={skipAll}>Skip setup</button>}
      </div>
      <div className="progress" role="progressbar" aria-label="Setup progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
        <span style={{ transform: `scaleX(${pct / 100})` }} />
      </div>

      <section key={step} className="card raised stack lg step-enter" style={{ marginTop: 20 }} aria-labelledby="step-h">
        {step === "intro" && (
          <>
            <div className="setup-ico" aria-hidden>◎</div>
            <h1 id="step-h" ref={headingRef} tabIndex={-1}>A few optional extras</h1>
            <p className="muted">Calm works fully without any of these. Each one is explained first, and nothing is requested until you tap <strong>Enable</strong>. You can change your mind any time in Settings.</p>
            <ul className="cap-list">
              <li><strong>Gentle reminders</strong> — browser notifications</li>
              <li><strong>Screen stays on</strong> during guided sessions</li>
              <li><strong>Haptic cues</strong> while breathing, where your device supports it</li>
              <li><strong>Health data</strong> — what&apos;s possible today, honestly</li>
            </ul>
            <div className="row"><button className="btn big" onClick={advance}>Let&apos;s go</button><button className="btn ghost big" onClick={skipAll}>Not now</button></div>
          </>
        )}

        {step === "notifications" && (
          <>
            <div className="row between"><div className="setup-ico" aria-hidden>◔</div><span className="pill">Optional</span></div>
            <h1 id="step-h" ref={headingRef} tabIndex={-1}>Gentle reminders</h1>
            <Facts
              enables="A check-in reminder, and a heads-up when the Early Shift Radar notices something worth a look."
              why="Some people find it easier to check in with a nudge. Calm sends at most two a day and none during your quiet hours."
              data="Nothing is read from your device. Notification text is kept generic so nothing personal shows on a lock screen." />
            <p className="faint">Browser support: {supportLabel(support?.notif)}. Reminders arrive while Calm is open in a browser tab; Calm doesn&apos;t yet send notifications when it&apos;s fully closed.</p>
            {result ? <Notice tone={result.tone} title={result.title}>{result.body}</Notice> : support?.notif === "denied" ? <Notice tone="warn" title="Already blocked in this browser">{outcomeMessage("already-denied").body}</Notice> : null}
            <div className="row">
              {!result && support?.notif !== "denied" && support?.notif !== "unsupported" && support?.notif !== "insecure" && <button className="btn" onClick={enableNotifications} disabled={busy || !support}>{busy ? "Waiting for your browser…" : "Enable reminders"}</button>}
              <button className={result ? "btn" : "btn ghost"} onClick={advance}>{result ? "Continue" : "Skip for now"}</button>
            </div>
          </>
        )}

        {step === "screen" && (
          <>
            <div className="row between"><div className="setup-ico" aria-hidden>☼</div><span className="pill">Optional</span></div>
            <h1 id="step-h" ref={headingRef} tabIndex={-1}>Keep the screen on during sessions</h1>
            <Facts
              enables="Your screen won't dim or lock in the middle of a breathing exercise or soundscape."
              why="Guided sessions last a few minutes, which is longer than many screens stay awake."
              data="Nothing. It only asks the browser to keep the display awake, and only while a session runs." />
            <p className="faint">Browser support: {supportLabel(support?.wake)}.</p>
            {result && <Notice tone={result.tone} title={result.title}>{result.body}</Notice>}
            <div className="row">
              {!result && support?.wake === "available" && <button className="btn" onClick={enableScreen} disabled={busy}>Enable</button>}
              <button className={result || support?.wake === "unsupported" ? "btn" : "btn ghost"} onClick={advance}>{result || support?.wake === "unsupported" ? "Continue" : "Skip for now"}</button>
            </div>
          </>
        )}

        {step === "haptics" && (
          <>
            <div className="row between"><div className="setup-ico" aria-hidden>≋</div><span className="pill">Optional</span></div>
            <h1 id="step-h" ref={headingRef} tabIndex={-1}>Haptic breathing cues</h1>
            <Facts
              enables="A short, soft tap when it's time to breathe in or out — so you can close your eyes."
              why="Some people find it easier to follow a rhythm they can feel."
              data="Nothing is read. Calm only asks the device to vibrate briefly." />
            <p className="faint">Device support: {supportLabel(support?.vib)}{support?.vib === "unsupported" ? " (common on iPhone and desktop)" : ""}.</p>
            {result && <Notice tone={result.tone} title={result.title}>{result.body}</Notice>}
            <div className="row">
              {!result && support?.vib === "available" && <button className="btn" onClick={enableHaptics} disabled={busy}>Enable and try it</button>}
              <button className={result || support?.vib === "unsupported" ? "btn" : "btn ghost"} onClick={advance}>{result || support?.vib === "unsupported" ? "Continue" : "Skip for now"}</button>
            </div>
          </>
        )}

        {step === "health" && (
          <>
            <div className="row between"><div className="setup-ico" aria-hidden>♡</div><span className="pill">Optional</span></div>
            <h1 id="step-h" ref={headingRef} tabIndex={-1}>Health and wearable data</h1>
            <p className="muted">{HEALTH_NOTE}</p>
            <Facts
              enables="Imported sleep can fill in nights you didn't log yourself. Heart rate, HRV and steps are stored for you but not used in your pulse yet."
              why="Fewer gaps make your patterns more reliable."
              data="Only the readings in a file you choose to upload. Nothing is read from your device in the background." />
            <div className="row">
              <Link className="btn ghost" href="/settings#signals">Import a file in Settings</Link>
              <button className="btn" onClick={advance}>Continue</button>
            </div>
          </>
        )}

        {step === "done" && (
          <>
            <div className="setup-ico" aria-hidden>✓</div>
            <h1 id="step-h" ref={headingRef} tabIndex={-1}>You&apos;re set</h1>
            <ul className="summary-list">
              <li><span>Reminders</span><span className={`pill ${on.notifyEnabled ? "ok" : ""}`}>{on.notifyEnabled ? "On" : "Off"}</span></li>
              <li><span>Screen on during sessions</span><span className={`pill ${on.wakeLockEnabled ? "ok" : ""}`}>{on.wakeLockEnabled ? "On" : "Off"}</span></li>
              <li><span>Haptic cues</span><span className={`pill ${on.hapticsEnabled ? "ok" : ""}`}>{on.hapticsEnabled ? "On" : "Off"}</span></li>
            </ul>
            <details>
              <summary>What Calm never asks for</summary>
              <ul>{NOT_USED.map((n) => <li key={n.id}><strong>{n.name}:</strong> {n.why}</li>)}</ul>
            </details>
            <p className="faint">Change any of this in Settings → Device &amp; permissions.</p>
            <div className="row"><Link href="/" className="btn big" onClick={() => router.refresh()}>Go to Today</Link><Link href="/settings#device" className="btn ghost big">Open settings</Link></div>
          </>
        )}
      </section>

      {i > 0 && step !== "done" && <div style={{ marginTop: 12 }}><button className="btn quiet small" onClick={() => go(i - 1)}>← Back</button></div>}
    </div>
  );
}
