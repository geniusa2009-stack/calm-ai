"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Slider } from "@/components/Slider";
import { CrisisCard } from "@/components/CrisisCard";
import { api } from "@/lib/client";
import type { Pulse } from "@/lib/engine/pulse";
import type { Resource } from "@/lib/safety";

interface Result { pulse: Pulse; before: { state: string; score: number }; crisis: boolean; resources?: Resource[] }

export function CheckInForm({ suggestedTags, showFocus, alreadyToday, defaultSleep }: { suggestedTags: string[]; showFocus: boolean; alreadyToday: boolean; defaultSleep: number }) {
  const router = useRouter();
  const [stress, setStress] = useState(5);
  const [mood, setMood] = useState(6);
  const [energy, setEnergy] = useState(6);
  const [focus, setFocus] = useState(6);
  const [askSleep, setAskSleep] = useState(!alreadyToday);
  const [sleep, setSleep] = useState(defaultSleep);
  const [quality, setQuality] = useState(3);
  const [tags, setTags] = useState<string[]>([]);
  const [custom, setCustom] = useState("");
  const [note, setNote] = useState("");
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const toggle = (t: string) => setTags((xs) => (xs.includes(t) ? xs.filter((x) => x !== t) : [...xs, t]));
  const allTags = [...new Set([...suggestedTags, ...tags])];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const r = await api<Result>("/api/checkins", "POST", {
        stress, mood, energy, focus: showFocus ? focus : null,
        sleepHours: askSleep ? sleep : null, sleepQuality: askSleep ? quality : null,
        tags, note: note || null, remember,
      });
      setResult(r);
      router.refresh();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  if (result) {
    const p = result.pulse;
    const harder = p.state === "strained" || p.state === "stretched";
    return (
      <div className="stack">
        {result.crisis && result.resources && <CrisisCard resources={result.resources} />}
        <div className="card stack">
          <span className="faint">Thanks — saved.</span>
          <h2>Your pulse: {p.label}</h2>
          <p>{p.blurb}</p>
          {p.drivers.length > 0 && <ul style={{ margin: 0, paddingLeft: 18 }}>{p.drivers.map((d) => <li key={d.metric}>{d.text}</li>)}</ul>}
          <p className="faint">{p.confidenceText}</p>
          <div className="row">
            {harder ? <Link href="/support" className="btn">Open Calm Window</Link> : <Link href="/" className="btn">Back to today</Link>}
            <Link href="/patterns" className="btn ghost">See patterns</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="stack" style={{ gap: 18 }}>
      <div className="card stack" style={{ gap: 20 }}>
        <Slider label="Stress" value={stress} onChange={setStress} lo="Calm" hi="Overwhelmed" />
        <Slider label="Mood" value={mood} onChange={setMood} lo="Low" hi="Great" />
        <Slider label="Energy" value={energy} onChange={setEnergy} lo="Drained" hi="Full" />
        {showFocus && <Slider label="Focus" value={focus} onChange={setFocus} lo="Scattered" hi="Sharp" />}
      </div>

      <div className="card stack">
        <div className="row between">
          <strong>Last night&apos;s sleep</strong>
          <label className="row" style={{ gap: 6, fontSize: "0.9rem" }}><input type="checkbox" checked={askSleep} onChange={(e) => setAskSleep(e.target.checked)} /> include</label>
        </div>
        {askSleep && (
          <>
            <Slider label="Hours" value={sleep} onChange={setSleep} min={3} max={11} step={0.25} lo="3h" hi="11h" unit="h" />
            <Slider label="Quality" value={quality} onChange={setQuality} min={1} max={5} lo="Restless" hi="Deep" />
          </>
        )}
        {alreadyToday && <span className="faint">You&apos;ve already checked in today, so sleep is optional.</span>}
      </div>

      <div className="card stack">
        <strong>What&apos;s going on? <span className="faint">Tap any that apply — Calm learns how they affect you.</span></strong>
        <div className="row">
          {allTags.map((t) => <button type="button" key={t} className={`chip ${tags.includes(t) ? "on" : ""}`} aria-pressed={tags.includes(t)} onClick={() => toggle(t)}>{t.replace(/-/g, " ")}</button>)}
        </div>
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <input type="text" placeholder="Add your own (e.g. family visit)" value={custom} maxLength={32} onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (custom.trim()) { toggle(custom.trim().toLowerCase().replace(/\s+/g, "-")); setCustom(""); } } }} />
          <button type="button" className="btn ghost small" onClick={() => { if (custom.trim()) { toggle(custom.trim().toLowerCase().replace(/\s+/g, "-")); setCustom(""); } }}>Add</button>
        </div>
      </div>

      <div className="card stack">
        <label className="field">A note <span className="faint">Optional — anything on your mind</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
        </label>
        {note && <label className="row" style={{ gap: 6, fontSize: "0.9rem" }}><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Save this to my memory</label>}
      </div>

      {err && <p role="alert" style={{ color: "var(--strain)" }}>{err}</p>}
      <div><button className="btn big" disabled={busy}>{busy ? "Saving…" : "Save check-in"}</button></div>
    </form>
  );
}
