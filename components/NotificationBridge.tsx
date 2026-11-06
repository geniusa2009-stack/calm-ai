"use client";
import { useEffect } from "react";
import { notificationState, showNotification } from "@/lib/device/capabilities";
import { pickReminders, REMINDER_TEXT, type NudgeKind } from "@/lib/device/reminders";
import { hasPushSubscription } from "@/lib/push/client";

const CHECK_EVERY_MS = 30 * 60e3;

/**
 * Local reminders while Calm is open (including in a background tab). Mounted only when
 * the person opted in; also checks the live browser permission every time. There's no
 * push server, so nothing is delivered when the browser is closed.
 * localStorage holds only which nudge ids were already shown today (no wellbeing data).
 */
export function NotificationBridge() {
  useEffect(() => {
    let stopped = false;
    // Keyed by the LOCAL date in the browser's zone (not UTC), so the daily cap resets at local midnight.
    const key = () => `calm.reminded.${new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())}`;
    const read = (): string[] => { try { return JSON.parse(localStorage.getItem(key()) || "[]"); } catch { return []; } };
    const write = (ids: string[]) => { try { localStorage.setItem(key(), JSON.stringify(ids)); } catch { /* storage unavailable */ } };

    async function check() {
      if (stopped || notificationState() !== "granted") return;
      if (await hasPushSubscription()) return; // server push handles this device; avoid duplicates
      try {
        const res = await fetch("/api/nudges", { cache: "no-store" });
        if (!res.ok) return;
        const { nudges } = (await res.json()) as { nudges: { id: string; kind: NudgeKind }[] };
        const sent = read();
        for (const n of pickReminders(nudges, sent, document.visibilityState === "hidden")) {
          const t = REMINDER_TEXT[n.kind];
          if (showNotification(t.title, t.body, undefined, `calm-${n.id}`)) sent.push(n.id);
        }
        write(sent);
      } catch { /* offline or signed out: try again later */ }
    }

    const timer = setInterval(check, CHECK_EVERY_MS);
    const onVis = () => { if (document.visibilityState === "hidden") setTimeout(check, 60e3); };
    document.addEventListener("visibilitychange", onVis);
    return () => { stopped = true; clearInterval(timer); document.removeEventListener("visibilitychange", onVis); };
  }, []);
  return null;
}
