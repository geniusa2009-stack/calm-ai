"use client";
import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";

/** A quiet, dismissible invitation to the optional device setup. Never requests anything itself. */
export function SetupInvite({ resume }: { resume: boolean }) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <div className="notice info" role="region" aria-label="Optional device setup">
      <div className="notice-body">
        <span className="notice-title">{resume ? "Finish setting up optional extras?" : "Optional: reminders and session extras"}</span>
        <span className="faint">Reminders, keeping the screen on during sessions, and haptic cues. Each is explained before anything is asked.</span>
      </div>
      <div className="row" style={{ gap: 8 }}>
        <Link href="/setup/devices" className="btn small">{resume ? "Continue" : "Take a look"}</Link>
        <button className="btn quiet small" onClick={() => { setHidden(true); api("/api/settings", "POST", { deviceSetup: "skipped" }).catch(() => {}); }}>Not now</button>
      </div>
    </div>
  );
}
