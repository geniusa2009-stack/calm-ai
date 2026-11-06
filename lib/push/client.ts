"use client";
/**
 * Browser side of Web Push. Never requests permission itself: callers only subscribe after
 * permission is already "granted" (requested from an explicit click in the device setup).
 */
export function pushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && typeof Notification !== "undefined";
}

function keyBytes(b64url: string) {
  const s = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(s + "=".repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function serverKey(): Promise<string | null> {
  const r = await fetch("/api/push/config", { cache: "no-store" });
  return r.ok ? (await r.json()).publicKey : null;
}

export type PushSetup = "subscribed" | "unsupported" | "not-configured" | "no-permission" | "failed";

/** Subscribe this device (permission must already be granted). */
export async function subscribePush(): Promise<PushSetup> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission !== "granted") return "no-permission";
  try {
    const key = await serverKey();
    if (!key) return "not-configured";
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) }));
    const r = await fetch("/api/push/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON() }) });
    return r.ok ? "subscribed" : "failed";
  } catch { return "failed"; }
}

/** Unsubscribe this device locally and on the server. */
export async function unsubscribePush() {
  if (!pushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    await fetch("/api/push/subscribe", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
    await sub.unsubscribe();
  } catch { /* nothing to undo */ }
}

export async function hasPushSubscription() {
  if (!pushSupported()) return false;
  try { return !!(await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription()); } catch { return false; }
}
