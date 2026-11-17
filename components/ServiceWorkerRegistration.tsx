"use client";
import { useEffect, useState } from "react";

export function ServiceWorkerRegistration() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    let reloading = false;
    const onChange = () => { if (sessionStorage.getItem("calm.sw.accepted") === "1" && !reloading) { reloading = true; sessionStorage.removeItem("calm.sw.accepted"); window.location.reload(); } };
    navigator.serviceWorker.addEventListener("controllerchange", onChange);
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).then((reg) => {
      if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const w = reg.installing;
        w?.addEventListener("statechange", () => { if (w.state === "installed" && navigator.serviceWorker.controller) setWaiting(w); });
      });
    }).catch(() => { /* unsupported or blocked: the app works without it */ });
    return () => navigator.serviceWorker.removeEventListener("controllerchange", onChange);
  }, []);
  if (!waiting) return null;
  return (
    <div className="toast-region" role="status">
      <div className="toast" style={{ pointerEvents: "auto", display: "flex", gap: 12, alignItems: "center" }}>
        A new version of Calm is ready.
        <button className="btn small" onClick={() => { try { sessionStorage.setItem("calm.sw.accepted", "1"); } catch { /* ignore */ } waiting.postMessage({ type: "SKIP_WAITING" }); }}>Reload</button>
      </div>
    </div>
  );
}
