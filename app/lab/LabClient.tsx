"use client";
import { useEffect, useState } from "react";
import { Slider } from "@/components/Slider";
import { api } from "@/lib/client";
import type { WhatIfResult } from "@/lib/engine/whatif";

export function LabClient({ tags }: { tags: string[] }) {
  const [sleepDelta, setSleepDelta] = useState(0);
  const [reduce, setReduce] = useState<string[]>([]);
  const [add, setAdd] = useState<string[]>([]);
  const [daily, setDaily] = useState(false);
  const [res, setRes] = useState<WhatIfResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      api<WhatIfResult>("/api/whatif", "POST", { sleepDelta, reduceTags: reduce, addTags: add, dailySupport: daily }).then(setRes).catch((e) => setErr(e.message));
    }, 250);
    return () => clearTimeout(t);
  }, [sleepDelta, reduce, add, daily]);

  const toggle = (list: string[], set: (x: string[]) => void, t: string) => set(list.includes(t) ? list.filter((x) => x !== t) : [...list, t]);
  const good = (m: string, d: number) => (m === "stress" ? d < 0 : d > 0);

  return (
    <div className="grid g2">
      <div className="card stack" style={{ gap: 18 }}>
        <h2>If I…</h2>
        <Slider label="Slept more / less per night" value={sleepDelta} onChange={setSleepDelta} min={-2} max={2} step={0.5} lo="−2h" hi="+2h" unit="h" />
        <div className="stack" style={{ gap: 8 }}>
          <strong>Did less of</strong>
          <div className="row">{tags.map((t) => <button key={t} className={`chip ${reduce.includes(t) ? "on" : ""}`} aria-pressed={reduce.includes(t)} onClick={() => toggle(reduce, setReduce, t)}>{t.replace(/-/g, " ")}</button>)}</div>
        </div>
        <div className="stack" style={{ gap: 8 }}>
          <strong>Did more of (≈3× a week)</strong>
          <div className="row">{tags.map((t) => <button key={t} className={`chip ${add.includes(t) ? "on" : ""}`} aria-pressed={add.includes(t)} onClick={() => toggle(add, setAdd, t)}>{t.replace(/-/g, " ")}</button>)}</div>
        </div>
        <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={daily} onChange={(e) => setDaily(e.target.checked)} /> Used my most effective support tool daily</label>
      </div>
      <div className="card stack">
        <h2>…my weeks might look like</h2>
        {err && <p role="alert" style={{ color: "var(--strain)" }}>{err}</p>}
        {!res ? <p className="muted">Calculating…</p> : !res.ready ? <p className="muted">{res.caveat}</p> : (
          <>
            {res.projections.map((p) => {
              const d = Math.round((p.projected - p.current) * 10) / 10;
              return (
                <div key={p.metric} className="stack" style={{ gap: 2 }}>
                  <div className="row between"><strong style={{ textTransform: "capitalize" }}>{p.metric}</strong>
                    <span style={{ color: d === 0 ? "var(--ink-2)" : good(p.metric, d) ? "var(--bright)" : "var(--strain)", fontWeight: 600 }}>{p.current} → {p.projected}</span></div>
                  <span className="faint">Plausible range {p.low}–{p.high}</span>
                </div>
              );
            })}
            {res.basis.length > 0 && <details open><summary>Based on</summary><ul>{res.basis.map((b) => <li key={b}>{b}</li>)}</ul></details>}
            <p className="faint">{res.caveat}</p>
          </>
        )}
      </div>
    </div>
  );
}
