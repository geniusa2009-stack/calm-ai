"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { CrisisCard } from "@/components/CrisisCard";
import type { Resource } from "@/lib/safety";

interface Msg { role: "user" | "assistant"; content: string }
interface Reply { content: string; flagged: boolean; resources?: Resource[]; configured: boolean }

export function Chat({ initial, configured }: { initial: Msg[]; configured: boolean }) {
  const [msgs, setMsgs] = useState<Msg[]>(initial);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [resources, setResources] = useState<Resource[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [msgs, busy]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t || busy) return;
    setMsgs((m) => [...m, { role: "user", content: t }]); setText(""); setBusy(true); setErr(null);
    try {
      const r = await api<Reply>("/api/companion", "POST", { text: t });
      setMsgs((m) => [...m, { role: "assistant", content: r.content }]);
      if (r.resources) setResources(r.resources);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  async function clear() { await api("/api/companion", "DELETE"); setMsgs([]); setResources(null); }

  return (
    <div className="stack">
      {!configured && <div className="notice info" role="status"><span>The AI companion isn&apos;t configured on this server (no <code>ANTHROPIC_API_KEY</code>). You can still send messages — you&apos;ll get a clear note back, and safety support always works.</span></div>}
      {resources && <CrisisCard resources={resources} />}
      <div className="card stack">
        <div className="chat" aria-live="polite">
          {msgs.length === 0 && <div className="empty" style={{ padding: 24 }}><div className="empty-ico" aria-hidden>✎</div><p>What&apos;s on your mind? You can vent, think something through, or ask for a small next step.</p></div>}
          {msgs.map((m, i) => <div key={i} className={`bubble ${m.role}`}>{m.content}</div>)}
          {busy && <div className="bubble assistant" aria-label="The companion is replying"><span className="typing" aria-hidden><i /><i /><i /></span></div>}
          <div ref={end} />
        </div>
        {err && <div className="notice error" role="alert">{err}</div>}
        <form onSubmit={send} className="row" style={{ flexWrap: "nowrap", alignItems: "flex-end" }}>
          <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} placeholder="Type here…" aria-label="Message" style={{ minHeight: 52 }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); (e.currentTarget.form as HTMLFormElement).requestSubmit(); } }} />
          <button className="btn" disabled={busy || !text.trim()}>Send</button>
        </form>
        <div className="row between">
          <span className="faint">Not a therapist or crisis service. Messages are stored locally; clear them any time.</span>
          {msgs.length > 0 && <button className="btn ghost small" onClick={clear}>Clear conversation</button>}
        </div>
      </div>
    </div>
  );
}
