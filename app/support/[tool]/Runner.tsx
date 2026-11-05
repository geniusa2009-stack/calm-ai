"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Slider } from "@/components/Slider";
import { api } from "@/lib/client";
import type { Tool } from "@/lib/engine/support";

type Phase = { label: string; secs: number; scale: number };
const BREATHS: Record<string, Phase[]> = {
  "breath-box": [{ label: "Breathe in", secs: 4, scale: 1.8 }, { label: "Hold", secs: 4, scale: 1.8 }, { label: "Breathe out", secs: 4, scale: 1 }, { label: "Hold", secs: 4, scale: 1 }],
  "breath-478": [{ label: "Breathe in through your nose", secs: 4, scale: 1.8 }, { label: "Hold", secs: 7, scale: 1.8 }, { label: "Out slowly through your mouth", secs: 8, scale: 1 }],
  "breath-sigh": [{ label: "Inhale through your nose", secs: 2, scale: 1.6 }, { label: "Top up — one more sip of air", secs: 1, scale: 1.85 }, { label: "Long, slow exhale", secs: 6, scale: 1 }],
};
const STEPS: Record<string, { text: string; secs?: number; input?: boolean }[]> = {
  grounding: [
    { text: "Look around. Name 5 things you can see.", input: true },
    { text: "Notice 4 things you can feel — your feet, the chair, the air.", input: true },
    { text: "Listen. Name 3 things you can hear.", input: true },
    { text: "Find 2 things you can smell, or two smells you like.", input: true },
    { text: "Notice 1 thing you can taste — or take a sip of water.", input: true },
  ],
  "micro-reset": [
    { text: "Drop your shoulders away from your ears.", secs: 15 },
    { text: "Unclench your jaw. Let your tongue rest.", secs: 15 },
    { text: "Look at something far away. Let your eyes soften.", secs: 20 },
    { text: "One slow breath in… and a longer breath out.", secs: 20 },
    { text: "Roll your neck gently, one way, then the other.", secs: 20 },
    { text: "Choose one thing to do next. Just one.", secs: 20 },
  ],
  "wind-down": [
    { text: "Write down anything still on your mind, so it can wait until tomorrow.", input: true },
    { text: "Dim the lights or screens if you can.", secs: 30 },
    { text: "Breathe in for 4, out for 6. Keep going.", secs: 60 },
    { text: "Scan from your forehead to your feet, softening each part.", secs: 90 },
    { text: "Name one thing from today that was okay — even small.", input: true },
  ],
  reflect: [
    { text: "What's taking up the most space in your head right now?", input: true },
    { text: "What part of it is in your control today?", input: true },
    { text: "What's one small thing that would make the next hour a bit easier?", input: true },
  ],
};

function Breathing({ id, minutes, onDone }: { id: string; minutes: number; onDone: () => void }) {
  const phases = BREATHS[id];
  const cycleSecs = phases.reduce((a, p) => a + p.secs, 0);
  const totalCycles = id === "breath-sigh" ? 5 : Math.max(3, Math.round((minutes * 60) / cycleSecs));
  const [i, setI] = useState(0);
  const [cycle, setCycle] = useState(0);
  const [count, setCount] = useState(phases[0].secs);
  useEffect(() => {
    const t = setInterval(() => setCount((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (count > 0) return;
    const next = (i + 1) % phases.length;
    if (next === 0) {
      if (cycle + 1 >= totalCycles) { onDone(); return; }
      setCycle((c) => c + 1);
    }
    setI(next);
    setCount(phases[next].secs);
  }, [count, i, cycle, phases, totalCycles, onDone]);
  const p = phases[i];
  return (
    <div className="breath-stage" aria-live="polite">
      <div>
        <div style={{ display: "grid", placeItems: "center", height: 230 }}>
          <div className="breath-orb" style={{ transform: `scale(${p.scale})`, transitionDuration: `${p.secs}s` }} />
        </div>
        <div className="breath-label">{p.label} <span className="faint">{count}</span></div>
        <div className="faint" style={{ textAlign: "center" }}>Round {cycle + 1} of {totalCycles}</div>
      </div>
    </div>
  );
}

function Steps({ id, onDone }: { id: string; onDone: (notes: string[]) => void }) {
  const steps = STEPS[id];
  const [i, setI] = useState(0);
  const [notes, setNotes] = useState<string[]>(steps.map(() => ""));
  const [left, setLeft] = useState(steps[0].secs ?? 0);
  const step = steps[i];
  const next = () => (i + 1 >= steps.length ? onDone(notes) : (setI(i + 1), setLeft(steps[i + 1].secs ?? 0)));
  useEffect(() => {
    if (!step.secs) return;
    if (left <= 0) { next(); return; }
    const t = setTimeout(() => setLeft((l) => l - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left, step.secs]);
  return (
    <div className="card stack" aria-live="polite">
      <span className="faint">Step {i + 1} of {steps.length}</span>
      <p style={{ fontSize: "1.25rem", fontWeight: 600 }}>{step.text}</p>
      {step.input && <textarea value={notes[i]} onChange={(e) => setNotes(notes.map((n, j) => (j === i ? e.target.value : n)))} placeholder="Optional — type, or just notice" />}
      {step.secs ? <div className="faint">{left}s</div> : null}
      <div className="row"><button className="btn" onClick={next}>{i + 1 >= steps.length ? "Finish" : "Next"}</button></div>
    </div>
  );
}

function Soundscape({ minutes, onDone }: { minutes: number; onDone: () => void }) {
  const ctxRef = useRef<AudioContext | null>(null);
  const [playing, setPlaying] = useState(false);
  const [left, setLeft] = useState(minutes * 60);
  const [vol, setVol] = useState(0.5);
  const gainRef = useRef<GainNode | null>(null);

  function start() {
    const ctx = new AudioContext();
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let last = 0;
      for (let k = 0; k < len; k++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[k] = last * 3.2; } // brown noise
    }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const filter = ctx.createBiquadFilter(); filter.type = "lowpass"; filter.frequency.value = 900;
    const swell = ctx.createGain(); swell.gain.value = 0.7;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.08; // slow "waves"
    const lfoAmt = ctx.createGain(); lfoAmt.gain.value = 0.3;
    lfo.connect(lfoAmt).connect(swell.gain);
    const master = ctx.createGain(); master.gain.value = vol * 0.6;
    src.connect(filter).connect(swell).connect(master).connect(ctx.destination);
    src.start(); lfo.start();
    ctxRef.current = ctx; gainRef.current = master; setPlaying(true);
  }
  function stop() { ctxRef.current?.close(); ctxRef.current = null; setPlaying(false); }
  useEffect(() => () => { ctxRef.current?.close(); }, []);
  useEffect(() => { if (gainRef.current) gainRef.current.gain.value = vol * 0.6; }, [vol]);
  useEffect(() => {
    if (!playing) return;
    if (left <= 0) { stop(); onDone(); return; }
    const t = setTimeout(() => setLeft((l) => l - 1), 1000);
    return () => clearTimeout(t);
  }, [playing, left, onDone]);

  return (
    <div className="card stack" style={{ alignItems: "center", textAlign: "center" }}>
      <div className="breath-orb" style={{ transform: playing ? "scale(1.4)" : "scale(1)", transitionDuration: "6s" }} />
      <div className="kpi">{Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</div>
      <div className="row">
        {!playing ? <button className="btn" onClick={start}>Play</button> : <button className="btn ghost" onClick={stop}>Pause</button>}
        <button className="btn ghost" onClick={() => { stop(); onDone(); }}>I&apos;m done</button>
      </div>
      <label className="field" style={{ width: "100%", maxWidth: 260 }}>Volume<input type="range" min={0} max={1} step={0.05} value={vol} onChange={(e) => setVol(Number(e.target.value))} /></label>
      <span className="faint">Soft, generated sound. Close your eyes if you like.</span>
    </div>
  );
}

export function Runner({ tool, initialStress }: { tool: Tool; initialStress: number }) {
  const router = useRouter();
  const [stage, setStage] = useState<"pre" | "run" | "post" | "done">("pre");
  const [pre, setPre] = useState(initialStress);
  const [post, setPost] = useState(initialStress);
  const [helpful, setHelpful] = useState<1 | 0 | -1 | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [saveNotes, setSaveNotes] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const started = useRef(0);

  const finish = (n?: string[]) => { if (n) setNotes(n); setPost(pre); setStage("post"); };

  async function save() {
    try {
      const text = notes.filter(Boolean).join(" · ");
      await api("/api/sessions", "POST", { tool: tool.id, preStress: pre, postStress: post, helpful, durationSec: Math.round((Date.now() - started.current) / 1000), note: text || null });
      if (saveNotes && text) await api("/api/memories", "POST", { kind: "note", text: `${tool.name}: ${text}` });
      setStage("done");
      router.refresh();
    } catch (e) { setErr((e as Error).message); }
  }

  if (stage === "pre") return (
    <div className="card stack">
      <Slider label="How stressed do you feel right now?" value={pre} onChange={setPre} lo="Calm" hi="Overwhelmed" />
      <span className="faint">This lets Calm learn which tools actually help you.</span>
      <div className="row"><button className="btn big" onClick={() => { started.current = Date.now(); setStage("run"); }}>Begin</button></div>
    </div>
  );
  if (stage === "run") {
    if (tool.kind === "breathing") return <div className="card"><Breathing id={tool.id} minutes={tool.minutes} onDone={() => finish()} /><div className="row" style={{ justifyContent: "center" }}><button className="btn ghost small" onClick={() => finish()}>Finish early</button></div></div>;
    if (tool.kind === "audio") return <Soundscape minutes={tool.minutes} onDone={() => finish()} />;
    return <Steps id={tool.id} onDone={finish} />;
  }
  if (stage === "post") return (
    <div className="card stack">
      <h2>How do you feel now?</h2>
      <Slider label="Stress now" value={post} onChange={setPost} lo="Calm" hi="Overwhelmed" />
      <div className="row">
        <span>Did this help?</span>
        {([[1, "Yes"], [0, "A little"], [-1, "Not really"]] as const).map(([v, l]) => (
          <button key={v} type="button" className={`chip ${helpful === v ? "on" : ""}`} aria-pressed={helpful === v} onClick={() => setHelpful(v)}>{l}</button>
        ))}
      </div>
      {notes.some(Boolean) && <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={saveNotes} onChange={(e) => setSaveNotes(e.target.checked)} /> Save what I wrote to my memory</label>}
      {err && <p role="alert" style={{ color: "var(--strain)" }}>{err}</p>}
      <div className="row"><button className="btn" onClick={save}>Save</button></div>
    </div>
  );
  const drop = pre - post;
  return (
    <div className="card stack">
      <h2>{drop >= 2 ? "That made a real difference." : drop >= 1 ? "A little lighter." : "Thanks for taking the time."}</h2>
      <p className="muted">{drop > 0 ? `Stress went from ${pre} to ${post}.` : "Not every tool works every time — Calm will weigh this when suggesting next time."}</p>
      <div className="row"><Link href="/" className="btn">Back to today</Link><Link href="/support" className="btn ghost">Try something else</Link></div>
    </div>
  );
}
