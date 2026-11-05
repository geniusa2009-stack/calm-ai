import Link from "next/link";
import { snapshot } from "@/lib/snapshot";
import { requireUser } from "@/lib/session";
import { PulseRing, STATE_COLOR, LineChart, Legend } from "@/components/charts";
import { Welcome } from "@/components/Welcome";
import { DemoBanner } from "@/components/DemoBanner";
import { daysBetween, localDate } from "@/lib/engine/days";

export const dynamic = "force-dynamic";

function greeting(name: string) {
  const h = new Date().getHours();
  const part = h < 5 ? "Still up" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return name ? `${part}, ${name}` : part;
}

export default async function Today() {
  const user = await requireUser();
  const s = snapshot(user.id);
  if (!s.settings.onboarded) return <Welcome />;
  const { pulse, radar, recommendations, nudges, mode } = s;
  const top = recommendations[0];
  const isDemo = user.isDemo;
  const today = localDate(new Date());
  const week = s.days.filter((d) => daysBetween(d.date, today) < 14);
  const b = pulse.baseline;

  return (
    <div className="stack" style={{ gap: 20 }}>
      {isDemo && <DemoBanner />}
      <div className="row between">
        <div>
          <h1>{greeting(s.settings.displayName)}</h1>
          <span className="muted">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })} · <Link href="/settings">{mode.label} mode</Link></span>
        </div>
        {!s.checkedInToday && <Link href="/check-in" className="btn">Check in</Link>}
      </div>

      {nudges.length > 0 && (
        <div className="stack" style={{ gap: 8 }} aria-label="Nudges">
          {nudges.map((n) => (
            <div key={n.id} className={`nudge ${n.tone}`}>
              <span>{n.text}</span>
              <Link href={n.href} className="btn small ghost">{n.cta}</Link>
            </div>
          ))}
        </div>
      )}

      <div className="grid g2">
        <section className="card" aria-labelledby="pulse-h">
          <div className="row" style={{ alignItems: "flex-start", gap: 20 }}>
            <PulseRing score={pulse.score} state={pulse.state} size={170} />
            <div style={{ flex: 1, minWidth: 180 }}>
              <span className="faint">Calm Pulse</span>
              <h2 id="pulse-h" style={{ fontSize: "1.5rem", color: STATE_COLOR[pulse.state] }}>{pulse.label}</h2>
              <p>{pulse.blurb}</p>
              <p className="faint">{pulse.confidenceText}</p>
            </div>
          </div>
          {pulse.drivers.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <strong style={{ fontSize: "0.9rem" }}>What&apos;s shaping it</strong>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                {pulse.drivers.map((d) => <li key={d.metric}>{d.text}</li>)}
              </ul>
            </div>
          )}
        </section>

        <section className="card calm-window stack" aria-labelledby="cw-h">
          <span className="faint">Calm Window</span>
          <h2 id="cw-h">{pulse.state === "strained" || pulse.state === "stretched" ? "Take a minute for yourself" : "A small reset, whenever you want one"}</h2>
          <p className="muted">Suggested for you right now: <strong>{top.tool.name}</strong> ({top.tool.minutes} min). {top.reason}</p>
          <div className="row">
            <Link href={`/support/${top.tool.id}`} className="btn big">Open Calm Window</Link>
            <Link href="/support" className="btn ghost">Other options</Link>
          </div>
          <div className="stack" style={{ gap: 6, marginTop: 4 }}>
            {recommendations.slice(1, 3).map((r) => (
              <Link key={r.tool.id} href={`/support/${r.tool.id}`} className="faint">{r.tool.name} · {r.tool.minutes} min — {r.reason}</Link>
            ))}
          </div>
        </section>
      </div>

      <section className="card" id="radar" aria-labelledby="radar-h">
        <div className="row between"><h2 id="radar-h">Early Shift Radar</h2><span className="faint">Watches for slow changes against your usual</span></div>
        {!radar.ready ? <p className="muted">{radar.note}</p>
          : radar.signals.length === 0 ? <p className="muted">Nothing drifting. Your last few days look like your usual patterns.</p>
          : (
            <div className="stack">
              {radar.signals.map((sig) => (
                <div key={sig.id} className={`signal ${sig.severity}`}>
                  <div className="row"><strong>{sig.title}</strong><span className={`pill ${sig.severity}`}>{sig.severity === "act" ? "worth acting on" : sig.severity === "notice" ? "worth noticing" : sig.severity === "positive" ? "good news" : "gentle"}</span></div>
                  <p style={{ margin: "4px 0" }}>{sig.detail}</p>
                  <p className="muted" style={{ margin: "4px 0" }}><em>Why it matters:</em> {sig.why} <strong>Try:</strong> {sig.suggestion}</p>
                  {sig.evidence.length > 0 && <details><summary>Show the data</summary><ul>{sig.evidence.map((e) => <li key={e}>{e}</li>)}</ul></details>}
                </div>
              ))}
            </div>
          )}
      </section>

      {week.length >= 3 && (
        <section className="card" aria-labelledby="wk-h">
          <div className="row between"><h2 id="wk-h">Last two weeks</h2><Link href="/patterns" className="faint">All patterns →</Link></div>
          <LineChart
            ariaLabel="Stress and mood over the last two weeks" width={520}
            labels={week.map((d) => new Date(d.date + "T12:00:00").toLocaleDateString(undefined, { weekday: "short" }))}
            band={{ lo: b.stress.center - b.stress.spread, hi: b.stress.center + b.stress.spread, color: "var(--care-soft)" }}
            series={[
              { label: "Stress", color: "var(--strain)", values: week.map((d) => d.stress) },
              { label: "Mood", color: "var(--calm)", values: week.map((d) => d.mood) },
              { label: "Energy", color: "var(--low)", values: week.map((d) => d.energy), dashed: true },
            ]}
          />
          <Legend items={[{ label: "Stress", color: "var(--strain)" }, { label: "Mood", color: "var(--calm)" }, { label: "Energy", color: "var(--low)" }, { label: "Your usual stress range", color: "var(--care-soft)" }]} />
        </section>
      )}

      {s.suggestProfessional && (
        <section className="card" style={{ borderColor: "var(--stretch)" }}>
          <h2>It&apos;s been a hard couple of weeks</h2>
          <p>{s.hardDays14} of your last 14 check-ins were outside your usual range. That&apos;s a lot to carry, and it can really help to talk it through with someone — a person you trust, or a professional.</p>
          <Link href="/circle" className="btn ghost">See options for support</Link>
        </section>
      )}
    </div>
  );
}
