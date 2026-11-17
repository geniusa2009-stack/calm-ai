"use client";
import { useEffect } from "react";
import { pushSupported, subscribePush, unsubscribePush } from "@/lib/push/client";

export function PushSync({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!pushSupported() || process.env.NODE_ENV !== "production") return;
    if (enabled && Notification.permission === "granted") subscribePush();
    else unsubscribePush();
  }, [enabled]);
  return null;
}
