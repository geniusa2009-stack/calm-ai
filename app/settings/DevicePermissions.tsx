"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { Notice } from "@/components/ui";
import {
  NOT_USED, notificationState, outcomeMessage, requestNotifications, showNotification, tap, vibrationState, wakeLockState,
  type NotificationState,
} from "@/lib/device/capabilities";
import type { DeviceSetup } from "@/lib/types";
import { hasPushSubscription, pushSupported, subscribePush, unsubscribePush } from "@/lib/push/client";

interface Prefs { notifyEnabled: boolean; wakeLockEnabled: boolean; hapticsEnabled: boolean; deviceSetup: DeviceSetup; pushCheckin: boolean; pushRadar: boolean; reminderHour: number }
type Msg = { tone: "success" | "info" | "warn" | "error"; title: string; body: string } | null;

const NOTIF_LABEL: Record<NotificationState, [string, string]> = {
  unsupported: ["Not supported", ""],
  insecure: ["Not supported here", ""],
  prompt: ["Not asked yet", ""],
  granted: ["Allowed in browser", "ok"],
  denied: ["Blocked in browser", "warn"],
};

export function DevicePermissions({ prefs }: { prefs: Prefs }) {
  const router = useRouter();
  const [p, setP] = useState(prefs);
  const [notif, setNotif] = useState<NotificationState | null>(null);
  const [wake, setWake] = useState<string | null>(null);
  const [vib, setVib] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const [pushOn, setPushOn] = useState<boolean | null>(null);

  // Live browser state, read after mount. Reading never prompts.
  const refresh = () => { setNotif(notificationState()); setWake(wakeLockState()); setVib(vibrationState()); hasPushSubscription().then(setPushOn); };
  useEffect(() => {
    refresh();
    // Pick up changes made in the browser's own site settings when the person comes back.
    const onVis = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  async function save(patch: Partial<Prefs>) {
    setP((x) => ({ ...x, ...patch }));
    await api("/api/settings", "POST", patch);
    router.refresh();
  }

  async function toggleNotifications(want: boolean) {
    setMsg(null);
    if (!want) {
      await save({ notifyEnabled: false });
      await unsubscribePush(); setPushOn(false);
      setMsg({ tone: "info", title: "Reminders off", body: "Calm won't send notifications. The browser permission itself stays as it is; you can revoke it in your browser's site settings." });
      return;
    }
    setBusy(true);
    const { outcome, state } = await requestNotifications(); // prompts only if the browser hasn't decided yet
    setNotif(state);
    const granted = outcome === "granted" || outcome === "already-granted";
    await save({ notifyEnabled: granted });
    if (granted) setPushOn((await subscribePush()) === "subscribed");
    setMsg(outcomeMessage(outcome));
    setBusy(false);
  }

  const notifBadge = notif ? NOTIF_LABEL[notif] : ["Checking…", ""];
  const notifOn = p.notifyEnabled && notif === "granted";
  const canToggleNotif = notif === "prompt" || notif === "granted";

  return (
    <section className="card stack" id="device" aria-labelledby="device-h">
      <div className="section-title">
        <h2 id="device-h">Device &amp; permissions</h2>
        <Link href="/setup/devices?restart=1" className="btn ghost small">{p.deviceSetup === "done" ? "Run setup again" : "Open guided setup"}</Link>
      </div>
      <p className="muted">These are <strong>browser permissions</strong> on this device. They&apos;re separate from <a href="#signals">connected data</a> (wearables and imports), which is stored in your account. Calm keeps only your on/off choices; it never stores what the browser reports.</p>

      <div>
        <div className="perm-row">
          <div>
            <div className="row" style={{ gap: 8 }}><strong>Reminders</strong><span className={`pill ${notifBadge[1]}`}>{notifBadge[0]}</span></div>
            <div className="faint">Generic check-in and radar reminders, at most two a day, never in quiet hours. Delivered only while Calm is open in a browser tab.</div>
            {notif === "denied" && <div className="faint" style={{ marginTop: 4 }}>To allow them, open this site&apos;s settings in your browser (the icon beside the address), allow notifications, then come back.</div>}
            {(notif === "unsupported" || notif === "insecure") && <div className="faint" style={{ marginTop: 4 }}>Not available in this browser. On iPhone, web notifications only work after adding Calm to the Home Screen.</div>}
          </div>
          <div className="row" style={{ gap: 8 }}>
            {notifOn && <button className="btn ghost small" onClick={() => setMsg(showNotification("Calm", "This is what a reminder looks like.") ? { tone: "success", title: "Sent", body: "If you didn't see it, check your system's notification settings or Focus/Do Not Disturb." } : { tone: "warn", title: "Couldn't show it", body: "Some browsers (e.g. Chrome on Android) only show notifications from installed web apps." })}>Send a test</button>}
            <label className="switch">
              <span className="sr-only">Reminders</span>
              <input type="checkbox" role="switch" checked={notifOn} disabled={busy || !canToggleNotif} aria-describedby="device-h"
                onChange={(e) => toggleNotifications(e.target.checked)} />
            </label>
          </div>
        </div>

        <div className="perm-row">
          <div>
            <div className="row" style={{ gap: 8 }}><strong>Keep screen on during sessions</strong><span className={`pill ${wake === "available" ? "ok" : ""}`}>{wake === null ? "Checking…" : wake === "available" ? "Supported" : "Not supported"}</span></div>
            <div className="faint">Uses the Screen Wake Lock API only while a guided session runs. No permission prompt; nothing is read.</div>
          </div>
          <label className="switch">
            <span className="sr-only">Keep screen on during sessions</span>
            <input type="checkbox" role="switch" checked={p.wakeLockEnabled && wake === "available"} disabled={wake !== "available"} onChange={(e) => save({ wakeLockEnabled: e.target.checked })} />
          </label>
        </div>

        <div className="perm-row">
          <div>
            <div className="row" style={{ gap: 8 }}><strong>Haptic breathing cues</strong><span className={`pill ${vib === "available" ? "ok" : ""}`}>{vib === null ? "Checking…" : vib === "available" ? "Supported" : "Not supported"}</span></div>
            <div className="faint">A short tap at each breathing phase. Not available on iPhone or most desktops.</div>
          </div>
          <label className="switch">
            <span className="sr-only">Haptic breathing cues</span>
            <input type="checkbox" role="switch" checked={p.hapticsEnabled && vib === "available"} disabled={vib !== "available"} onChange={(e) => { save({ hapticsEnabled: e.target.checked }); if (e.target.checked) tap(); }} />
          </label>
        </div>
      </div>

      {notifOn && (
        <div className="stack" style={{ gap: 8 }} aria-label="Reminder preferences" role="group">
          <span className="faint">
            {pushOn ? "This device receives server push: reminders can arrive even when Calm is closed (where your browser and OS allow it)."
              : pushSupported() ? "This device gets reminders only while Calm is open in a tab (push isn't set up on this server, or the browser declined a push subscription)."
              : "This browser doesn't support push, so reminders arrive only while Calm is open in a tab."}
          </span>
          <label className="switch"><input type="checkbox" role="switch" checked={p.pushCheckin} onChange={(e) => save({ pushCheckin: e.target.checked })} /> Check-in reminder</label>
          <label className="field" style={{ maxWidth: 220 }}>…not before (your local time)
            <select value={p.reminderHour} onChange={(e) => save({ reminderHour: Number(e.target.value) })}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{h}:00</option>)}</select>
          </label>
          <label className="switch"><input type="checkbox" role="switch" checked={p.pushRadar} onChange={(e) => save({ pushRadar: e.target.checked })} /> Heads-up when the radar notices a shift</label>
          {pushOn && <div><button className="btn ghost small" onClick={async () => {
            const r = await fetch("/api/push/test", { method: "POST" }); const j = await r.json().catch(() => ({}));
            setMsg(r.ok ? { tone: j.sent ? "success" : "warn", title: j.sent ? "Test push sent" : "Couldn't deliver", body: j.sent ? "It should arrive within a minute. If not, check your system's notification settings and Focus / Do Not Disturb." : "Your browser's push service didn't accept it. Try turning reminders off and on again." }
              : { tone: "warn", title: "Not sent", body: j.error ?? "Try again shortly." });
          }}>Send a test push</button></div>}
        </div>
      )}

      {msg && <Notice tone={msg.tone} title={msg.title}>{msg.body}</Notice>}

      <details>
        <summary>Permissions Calm never asks for</summary>
        <ul>{NOT_USED.map((n) => <li key={n.id}><strong>{n.name}:</strong> {n.why}</li>)}</ul>
      </details>
    </section>
  );
}
