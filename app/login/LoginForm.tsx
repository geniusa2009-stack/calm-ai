"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";

export function LoginForm({ initialMode }: { initialMode: "login" | "register" }) {
  const router = useRouter();
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await api(mode === "login" ? "/api/auth/login" : "/api/auth/register", "POST", { email, password });
      router.push("/"); router.refresh();
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  }
  async function demo() {
    setBusy(true); setErr(null);
    try { await api("/api/auth/demo", "POST", {}); router.push("/"); router.refresh(); }
    catch (e) { setErr((e as Error).message); setBusy(false); }
  }

  return (
    <div className="stack" style={{ maxWidth: 440, margin: "6vh auto 0" }}>
      <div className="brand" style={{ padding: 0 }}><span className="brand-dot" aria-hidden /> Calm</div>
      <div className="head">
        <h1>{mode === "login" ? "Welcome back" : "Create your account"}</h1>
        <p>Calm learns what <em>your</em> usual looks like and notices when things start to drift. It isn&apos;t a diagnosis tool or a crisis service.</p>
      </div>
      <form className="card stack" onSubmit={submit}>
        <label className="field">Email<input type="text" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={254} /></label>
        <label className="field">Password {mode === "register" && <span className="faint">At least 10 characters</span>}
          <input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} required maxLength={200} />
        </label>
        {err && <p role="alert" style={{ color: "var(--strain)", margin: 0 }}>{err}</p>}
        <button className="btn big" disabled={busy}>{mode === "login" ? "Sign in" : "Create account"}</button>
        <button type="button" className="btn ghost small" onClick={() => { setMode(mode === "login" ? "register" : "login"); setErr(null); }}>
          {mode === "login" ? "New here? Create an account" : "Already have an account? Sign in"}
        </button>
      </form>
      <div className="card stack">
        <strong>Just looking?</strong>
        <span className="muted">Explore a temporary demo account with six weeks of made-up data. It&apos;s kept separate from any real account and deleted automatically.</span>
        <div><button className="btn ghost" onClick={demo} disabled={busy}>Try the demo</button></div>
      </div>
    </div>
  );
}
