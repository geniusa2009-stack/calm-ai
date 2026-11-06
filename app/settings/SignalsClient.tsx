"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import type { IngestReport, ProviderStatus } from "@/lib/signals/types";
import { formatInstant } from "@/lib/time";

interface P { id: string; name: string; status: ProviderStatus; description: string }
interface C { provider: string; lastSyncAt: string | null; readings: number }

const STATUS: Record<ProviderStatus, string> = { implemented: "Available", oauth: "Account connection", demo: "Demo only", "not-implemented": "Not available yet" };

export interface OAuthState { availability: "available" | "blocked_by_credentials" | "token_key_missing"; connection: { status: string; last_sync_at: string | null; last_error: string | null } | null }

export function SignalsClient({ providers, conns, isDemo, tz, oauth = {} }: { providers: P[]; conns: C[]; isDemo: boolean; tz: string; oauth?: Record<string, OAuthState> }) {
  const router = useRouter();
  const [report, setReport] = useState<(IngestReport & { file: string }) | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setErr(null); setReport(null);
    try {
      if (f.size > 2_000_000) throw new Error("File too large (max 2 MB).");
      const text = await f.text();
      const res = await fetch("/api/signals/import", { method: "POST", headers: { "content-type": "application/json" }, body: text });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      setReport({ ...data.report, file: f.name });
      router.refresh();
    } catch (x) { setErr((x as Error).message); }
  }

  return (
    <section className="card stack" id="signals">
      <h2>Connected data</h2>
      <p className="muted">Calm can use sleep from a wearable to fill nights you didn&apos;t report yourself. Heart rate, HRV and steps are stored and exportable but not yet used in your pulse. No device is connected unless it&apos;s listed with readings below.</p>
      <div className="stack" style={{ gap: 8 }}>
        {providers.filter((p) => p.status !== "demo" || isDemo).map((p) => {
          const c = conns.find((x) => x.provider === p.id);
          return (
            <div key={p.id} className="row between card tight" style={p.status === "not-implemented" ? { background: "var(--surface-2)" } : undefined}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <strong>{p.name}</strong> <span className={`pill ${p.status === "implemented" ? "high" : ""}`}>{STATUS[p.status]}</span>
                <div className="faint">{p.description}</div>
                {c && <div className="faint">{c.readings} readings · last update {c.lastSyncAt ? formatInstant(c.lastSyncAt, tz, { dateStyle: "medium", timeStyle: "short" }) : "—"}</div>}
              </div>
              <div className="row" style={{ gap: 6 }}>
                {p.status === "oauth" && (() => {
                  const o = oauth[p.id];
                  if (isDemo) return <span className="faint">Not in demo accounts</span>;
                  if (!o || o.availability !== "available") return <span className="faint">{o?.availability === "token_key_missing" ? "Not set up on this server (token encryption key missing)" : "Not set up on this server (developer credentials missing)"}</span>;
                  if (!o.connection) return <a className="btn small" href={`/api/integrations/${p.id}/connect`}>Connect {p.name}</a>;
                  return (
                    <>
                      <span className={`pill ${o.connection.status === "connected" ? "ok" : "warn"}`}>{o.connection.status === "connected" ? "Connected" : "Reconnect needed"}</span>
                      {o.connection.status !== "connected" && <a className="btn small" href={`/api/integrations/${p.id}/connect`}>Reconnect</a>}
                      <button className="btn ghost small" onClick={async () => { const r = await fetch(`/api/integrations/${p.id}/sync`, { method: "POST" }); const j = await r.json().catch(() => ({})); if (!r.ok) setErr(j.error ?? "Sync failed"); else router.refresh(); }}>Sync now</button>
                      <button className="btn ghost small" onClick={async () => { const del = window.confirm(`Also delete the data already imported from ${p.name}? (OK = delete, Cancel = keep)`); await fetch(`/api/integrations/${p.id}?deleteData=${del ? 1 : 0}`, { method: "DELETE" }); router.refresh(); }}>Disconnect</button>
                    </>
                  );
                })()}
                {p.id === "file-import" && <label className="btn ghost small" style={{ cursor: "pointer" }}>Import JSON<input type="file" accept="application/json,.json" onChange={onFile} style={{ display: "none" }} /></label>}
                {c && c.readings > 0 && <button className="btn ghost small" onClick={async () => { await api(`/api/signals?provider=${p.id}`, "DELETE"); router.refresh(); }}>Remove data</button>}
              </div>
            </div>
          );
        })}
      </div>
      {err && <div className="notice error" role="alert">{err}</div>}
      {report && (
        <div className="notice info" role="status">
          <span>{report.file}: {report.inserted} new, {report.updated} corrected, {report.duplicates} already had, {report.rejected.length} rejected
            {report.rejected.length > 0 && <> — e.g. #{report.rejected[0].index}: {report.rejected[0].reason}</>}</span>
        </div>
      )}
    </section>
  );
}
