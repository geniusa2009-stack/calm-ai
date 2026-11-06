"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, detectedTimeZone } from "@/lib/client";

/**
 * Timezone rule (docs/timezone-architecture.md):
 *  - If the account has NO zone yet, adopt the browser's zone automatically (initial set).
 *  - If it has one and the device reports a different one (e.g. travel), ASK — never change
 *    it silently. "Keep" is remembered for that detected zone on this device only.
 * Past entries never move either way: each one keeps the zone it was recorded in.
 */
export function TimezoneSync({ saved }: { saved: string }) {
  const router = useRouter();
  const [detected, setDetected] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const d = detectedTimeZone();
    if (!d) return;
    if (!saved) { api("/api/settings", "POST", { timezone: d }).then(() => router.refresh()).catch(() => {}); return; }
    let dismissed: string | null = null;
    try { dismissed = localStorage.getItem("calm.tz.keep"); } catch { /* storage unavailable */ }
    if (d !== saved && dismissed !== d) setDetected(d);
  }, [saved, router]);

  if (!detected || hidden) return null;
  return (
    <div className="notice info" role="region" aria-label="Timezone">
      <div className="notice-body">
        <span className="notice-title">Your device is set to {detected.replace(/_/g, " ")}</span>
        <span className="faint">Calm is using {saved.replace(/_/g, " ")} for your days and reminders. Past check-ins keep the day they were made on either way.</span>
      </div>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn small" onClick={async () => { await api("/api/settings", "POST", { timezone: detected }); setHidden(true); router.refresh(); }}>Use {detected.split("/").pop()!.replace(/_/g, " ")}</button>
        <button className="btn quiet small" onClick={() => { try { localStorage.setItem("calm.tz.keep", detected); } catch { /* ignore */ } setHidden(true); }}>Keep {saved.split("/").pop()!.replace(/_/g, " ")}</button>
      </div>
    </div>
  );
}
