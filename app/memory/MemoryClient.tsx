"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import type { Memory, MemoryKind } from "@/lib/types";
import { EmptyState, Notice } from "@/components/ui";
import { formatInstant } from "@/lib/time";

const KIND_LABEL: Record<MemoryKind, string> = { note: "Note", win: "Win", trigger: "Watch out for", helped: "What helped", insight: "Insight" };

export function MemoryClient({ memories, tz }: { memories: Memory[]; tz: string }) {
  const router = useRouter();
  const [kind, setKind] = useState<MemoryKind>("helped");
  const [text, setText] = useState("");
  const [filter, setFilter] = useState<MemoryKind | "all">("all");
  const [err, setErr] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    try { await api("/api/memories", "POST", { kind, text }); setText(""); router.refresh(); } catch (e) { setErr((e as Error).message); }
  }
  const act = async (fn: () => Promise<unknown>) => { await fn(); router.refresh(); };
  const shown = memories.filter((m) => filter === "all" || m.kind === filter);

  return (
    <div className="stack" style={{ gap: 18 }}>
      <form className="card stack" onSubmit={add}>
        <div className="row">
          {(Object.keys(KIND_LABEL) as MemoryKind[]).filter((k) => k !== "insight").map((k) => (
            <button type="button" key={k} className={`chip ${kind === k ? "on" : ""}`} aria-pressed={kind === k} onClick={() => setKind(k)}>{KIND_LABEL[k]}</button>
          ))}
        </div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder={kind === "helped" ? "e.g. Calling Sam after a hard day" : kind === "trigger" ? "e.g. Back-to-back meetings with no lunch" : "Anything worth remembering"} aria-label="Memory text" />
        {err && <Notice tone="error">{err}</Notice>}
        <div><button className="btn">Remember this</button></div>
      </form>

      <div className="row" role="group" aria-label="Filter memories">
        {(["all", ...Object.keys(KIND_LABEL)] as (MemoryKind | "all")[]).map((k) => (
          <button key={k} className={`chip ${filter === k ? "on" : ""}`} aria-pressed={filter === k} onClick={() => setFilter(k)}>{k === "all" ? "All" : KIND_LABEL[k]}</button>
        ))}
      </div>

      {shown.length === 0 ? (
        <EmptyState icon="❖" title={filter === "all" ? "Nothing remembered yet" : "Nothing in this category yet"}>
          {filter === "all" ? "Add something that helped, a trigger to watch for, or a win worth keeping. Calm also adds an entry when a support session clearly works." : "Try another filter, or add one above."}
        </EmptyState>
      ) : (
        <div className="stack stagger">
          {shown.map((m) => (
            <div key={m.id} className="card tight stack" style={{ gap: 6 }}>
              <div className="row between">
                <span className="faint">{KIND_LABEL[m.kind]} · {formatInstant(m.ts, tz)}{m.source === "system" ? " · noted by Calm" : ""}{m.pinned ? " · 📌 pinned" : ""}</span>
                <div className="row" style={{ gap: 6 }}>
                  <button className="btn ghost small" onClick={() => act(() => api("/api/memories", "PATCH", { id: m.id, pinned: !m.pinned }))}>{m.pinned ? "Unpin" : "Pin"}</button>
                  <button className="btn ghost small" onClick={() => act(() => api(`/api/memories?id=${m.id}`, "DELETE"))} aria-label="Delete memory">Delete</button>
                </div>
              </div>
              <span>{m.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
