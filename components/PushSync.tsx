"use client";
import { useEffect } from "react";
import { pushSupported, subscribePush, unsubscribePush } from "@/lib/push/client";

/**
 * Keeps this device's push subscription consistent with the person's choices, WITHOUT ever
 * prompting: re-subscribes if reminders are on and permission is already granted (e.g. after
 * the browser expired the old subscription), and unsubscribes if permission was revoked or
 * reminders were turned off.
 */
export function PushSync({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!pushSupported() || process.env.NODE_ENV !== "production") return;
    if (enabled && Notification.permission === "granted") subscribePush();
    else unsubscribePush();
  }, [enabled]);
  return null;
}
