/**
 * Device capabilities Calm can use in a web browser, behind feature detection.
 *
 * RULES (enforced by tests/device.test.ts):
 *  - Reading status never triggers a permission prompt.
 *  - A prompt only happens inside request*(), which the UI calls from an explicit click.
 *  - If the browser already says "denied", we do not ask again — we explain how to change it.
 *  - Nothing here reads, stores or transmits sensor, location or audio data.
 *
 * Everything takes an injectable `env` (defaults to the real browser globals) so the
 * granted / denied / dismissed / unsupported paths can be tested without a browser.
 */

export interface NotificationLike {
  permission: "default" | "granted" | "denied";
  requestPermission: () => Promise<"default" | "granted" | "denied">;
  new (title: string, options?: { body?: string; tag?: string; icon?: string; silent?: boolean }): { close(): void; onclick: (() => void) | null };
}

export interface DeviceEnv {
  Notification?: NotificationLike;
  isSecureContext?: boolean;
  navigator?: {
    wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void>; released?: boolean; addEventListener?: (t: string, f: () => void) => void }> };
    vibrate?: (pattern: number | number[]) => boolean;
    userAgent?: string;
  };
}

export function browserEnv(): DeviceEnv {
  if (typeof window === "undefined") return {};
  return {
    Notification: (window as unknown as { Notification?: NotificationLike }).Notification,
    isSecureContext: window.isSecureContext,
    navigator: navigator as unknown as DeviceEnv["navigator"],
  };
}

// ---------- notifications ----------
export type NotificationState = "unsupported" | "insecure" | "prompt" | "granted" | "denied";
export type RequestOutcome = "granted" | "denied" | "dismissed" | "unsupported" | "already-denied" | "already-granted" | "error";

/** Current notification permission. NEVER prompts. */
export function notificationState(env: DeviceEnv = browserEnv()): NotificationState {
  if (!env.Notification) return "unsupported";
  if (env.isSecureContext === false) return "insecure";
  const p = env.Notification.permission;
  return p === "granted" ? "granted" : p === "denied" ? "denied" : "prompt";
}

/** Ask for notification permission. Call ONLY from a user gesture (button click). */
export async function requestNotifications(env: DeviceEnv = browserEnv()): Promise<{ outcome: RequestOutcome; state: NotificationState }> {
  const state = notificationState(env);
  if (state === "unsupported" || state === "insecure") return { outcome: "unsupported", state };
  if (state === "denied") return { outcome: "already-denied", state }; // never re-prompt after a denial
  if (state === "granted") return { outcome: "already-granted", state };
  try {
    const r = await env.Notification!.requestPermission();
    const outcome: RequestOutcome = r === "granted" ? "granted" : r === "denied" ? "denied" : "dismissed";
    return { outcome, state: notificationState(env) };
  } catch {
    return { outcome: "error", state: notificationState(env) };
  }
}

/**
 * Show a local notification. Text is deliberately generic: notifications can appear
 * on a lock screen, so they never contain wellbeing details.
 */
export function showNotification(title: string, body: string, env: DeviceEnv = browserEnv(), tag = "calm") {
  if (notificationState(env) !== "granted") return false;
  try {
    const n = new env.Notification!(title, { body, tag, silent: true });
    n.onclick = () => { try { window.focus(); } catch { /* not in a window */ } n.close(); };
    return true;
  } catch {
    return false; // e.g. Android Chrome requires a service worker for `new Notification`
  }
}

// ---------- screen wake lock ----------
export type WakeLockState = "unsupported" | "available";
export const wakeLockState = (env: DeviceEnv = browserEnv()): WakeLockState =>
  env.navigator?.wakeLock && env.isSecureContext !== false ? "available" : "unsupported";

/** Keep the screen on. No permission prompt exists for this API; it can still be refused (e.g. low battery, tab hidden). */
export async function acquireWakeLock(env: DeviceEnv = browserEnv()) {
  if (wakeLockState(env) === "unsupported") return { ok: false as const, reason: "unsupported" };
  try {
    const sentinel = await env.navigator!.wakeLock!.request("screen");
    return { ok: true as const, sentinel };
  } catch (e) {
    return { ok: false as const, reason: e instanceof Error ? e.name : "error" };
  }
}

// ---------- vibration ----------
export type VibrationState = "unsupported" | "available";
export const vibrationState = (env: DeviceEnv = browserEnv()): VibrationState =>
  typeof env.navigator?.vibrate === "function" ? "available" : "unsupported";

/** A short, gentle tap. Silently does nothing where unsupported (e.g. iOS Safari). */
export function tap(env: DeviceEnv = browserEnv(), pattern: number | number[] = 24) {
  if (vibrationState(env) === "unsupported") return false;
  try { return env.navigator!.vibrate!(pattern); } catch { return false; }
}

// ---------- capabilities Calm deliberately does NOT use ----------
export const NOT_USED = [
  { id: "location", name: "Location", why: "No Calm feature needs to know where you are, so Calm never asks." },
  { id: "microphone", name: "Microphone", why: "Calm has no voice features. It never records or uploads audio." },
  { id: "camera", name: "Camera", why: "Calm has no feature that needs a camera." },
  { id: "motion", name: "Motion sensors", why: "Calm doesn't read motion sensors and never infers stress, mood or health from raw sensor data." },
] as const;

export const HEALTH_NOTE =
  "Web browsers can't read Apple Health, Health Connect or wearable sensors directly. Calm can import readings you export yourself; live connections to Apple Health, Health Connect, Oura, Fitbit and Garmin aren't available yet.";

/** User-facing explanation for each outcome — accurate and pressure-free. */
export function outcomeMessage(outcome: RequestOutcome): { tone: "success" | "info" | "warn" | "error"; title: string; body: string } {
  switch (outcome) {
    case "granted":
    case "already-granted":
      return { tone: "success", title: "Notifications are on", body: "Calm will send at most a couple of gentle reminders a day while it's open in your browser, and never during your quiet hours." };
    case "dismissed":
      return { tone: "info", title: "No decision made", body: "That's fine. You can turn reminders on later from Settings → Device & permissions." };
    case "denied":
      return { tone: "info", title: "Notifications stay off", body: "Calm won't ask again. Everything still works — nudges appear on your Today screen instead. If you change your mind, allow notifications for this site in your browser's site settings." };
    case "already-denied":
      return { tone: "warn", title: "Notifications are blocked in your browser", body: "Calm can't ask again. To turn them on, open your browser's site settings for this page (usually the icon next to the address), allow notifications, then reload." };
    case "unsupported":
      return { tone: "warn", title: "Not available here", body: "This browser doesn't support web notifications on this page (on iPhone, they only work after adding Calm to your Home Screen). Nudges still appear on your Today screen." };
    default:
      return { tone: "error", title: "Something went wrong", body: "The browser didn't complete the request. You can try again from Settings." };
  }
}
