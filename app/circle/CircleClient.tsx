"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import type { CircleContact } from "@/lib/types";

const TEMPLATES = [
  { label: "Low-key", text: "Hey, I'm having a bit of a rough week. No need to fix anything — would you be up for a chat or a walk sometime soon?" },
  { label: "Direct", text: "I'm struggling more than usual at the moment and could really use someone to talk to. Are you around today or tomorrow?" },
  { label: "Just checking in", text: "Thinking of you — how are things? Would be good to catch up." },
];

export function CircleClient({ circle }: { circle: CircleContact[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [relation, setRelation] = useState("");
  const [contact, setContact] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await api("/api/circle", "POST", { name, relation: relation || "Friend", contact: contact || null });
    setName(""); setRelation(""); setContact(""); router.refresh();
  }
  async function copy(t: string) {
    try { await navigator.clipboard.writeText(t); setCopied(t); setTimeout(() => setCopied(null), 1500); } catch { /* clipboard unavailable */ }
  }

  return (
    <div className="stack">
      {circle.length === 0 ? <p className="muted">Add one or two people you&apos;d feel okay reaching out to. Calm never contacts anyone for you.</p> : (
        <div className="stack">
          {circle.map((c) => (
            <div key={c.id} className="row between card tight">
              <div><strong>{c.name}</strong> <span className="faint">· {c.relation}{c.note ? ` · ${c.note}` : ""}</span>{c.contact && <div className="faint">{c.contact}</div>}</div>
              <button className="btn ghost small" onClick={async () => { await api(`/api/circle?id=${c.id}`, "DELETE"); router.refresh(); }}>Remove</button>
            </div>
          ))}
        </div>
      )}
      <form onSubmit={add} className="row" style={{ alignItems: "flex-end" }}>
        <label className="field" style={{ flex: 1, minWidth: 140 }}>Name<input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} /></label>
        <label className="field" style={{ flex: 1, minWidth: 140 }}>Relation<input type="text" value={relation} onChange={(e) => setRelation(e.target.value)} maxLength={60} placeholder="Friend, sibling…" /></label>
        <label className="field" style={{ flex: 1, minWidth: 140 }}>Phone/handle <span className="faint">optional</span><input type="text" value={contact} onChange={(e) => setContact(e.target.value)} maxLength={120} /></label>
        <button className="btn">Add</button>
      </form>
      <div className="stack" style={{ gap: 8, marginTop: 8 }}>
        <strong>Not sure what to say? Copy a message</strong>
        {TEMPLATES.map((t) => (
          <div key={t.label} className="row between card tight" style={{ flexWrap: "nowrap" }}>
            <span><span className="faint">{t.label}:</span> {t.text}</span>
            <button className="btn ghost small" onClick={() => copy(t.text)}>{copied === t.text ? "Copied" : "Copy"}</button>
          </div>
        ))}
      </div>
    </div>
  );
}
