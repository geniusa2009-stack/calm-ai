import Link from "next/link";
import { snapshot } from "@/lib/snapshot";
import { requireUser } from "@/lib/session";
import { PulseRing, STATE_COLOR, LineChart, Legend } from "@/components/charts";
import { Welcome } from "@/components/Welcome";
import { DemoBanner } from "@/components/DemoBanner";
import { SetupInvite } from "@/components/SetupInvite";
import { EmptyState } from "@/components/ui";
import { daysBetween, localDate } from "@/lib/engine/days";

export const dynamic = "force-dynamic";

function greeting(name: string) {
  const h = new Date().getHours();
  const part = h < 5 ? "Still up" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return name ? `${part}, ${name}` : part;
}

const SEVERITY_LABEL = { act: "worth acting on", notice: "worth noticing", positive: "good news", gentle: "gentle" } as const;

export default async function Today() {
  const user = await requireUser();
  const s = snapshot(user.id);
  if (!s.settings.onboarded) return <Welcome />;
  const { pulse, radar, recommendations, nudges, mode } = s;
  const top = recommendations[0];
  const today = localDate(new Date());
  const week = s.days.filter((d) => daysBetween(d.date, today) < 14);
  const b = pulse.baseline;
  const showInvite = s.days.length > 0 && (s.settings.deviceSetup === "pending" || s.settings.deviceSetup === "in-progress");
  const harder = pulse.state === "strained" || pulse.state === "stretched";

  return (
    <div className="stack lg">
      {user.isDemo && <DemoBanner />}
      <header className="page-head">
        <div>
          <span className="eyebrow">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</span>
          <h1>{greeting(s.settings.displayName)}</h1>
          <p className="lead"><Link href="/settings#mode">{mode.label} mode</Link>{s.checkedInToday ? " · You've checked in today" : ""}</p>
        </div>
        {!s.checkedInToday && <Link href="/check-in" className="btn big">Check in</Link>}
      </header>

      {s.days.length === 0 ? (
        <EmptyState icon="◎" title="Your pulse starts with a check-in"
          action={<Link href="/check-in" className="btn big">Do your first check-in</Link>}>
          It takes about 20 seconds. After a few days Calm starts to learn what your usual looks like — nothing is compared with anyone else.
        </EmptyState>
      ) : (
        <div className="stack lg stagger">
          {nudges.length > 0 && (
            <div className="stack" style={{ gap: 8 }} role="region" aria-label="Nudges">
              {nudges.map((n) => (
                <div key={n.id} className={`nudge ${n.tone}`}>
                  <span>{n.text}</span>
                  <Link href={n.href} className="btn small ghost">{n.cta}</Link>
                </div>
              ))}
            </div>
          )}

          <div className="grid g2">
            <section className="card raised" aria-labelledby="pulse-h">
              <div className="pulse-layout">
                <PulseRing score={pulse.score} state={pulse.state} size={176} label={pulse.label} />
                <div style={{ flex: 1, minWidth: 180 }}>
                  <span className="eyebrow">Calm Pulse</span>
                  <h2 id="pulse-h" key={pulse.state} className="pulse-label fade-swap" style={{ color: STATE_COLOR[pulse.state] }}>{pulse.label}</h2>
                  <p>{pulse.blurb}</p>
                  <p className="faint" style={{ margin: 0 }}>{pulse.confidenceText}</p>
                </div>
              </div>
              {pulse.drivers.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <strong style={{ fontSize: "var(--fs-sm)" }}>What&apos;s shaping it</strong>
                  <ul className="driver-list">
                    {pulse.drivers.map((d) => <li key={d.metric}>{d.text}</li>)}
                  </ul>
                </div>
              )}
            </section>

            <section className="card calm-window stack" aria-labelledby="cw-h">
              <span className="eyebrow">Calm Window</span>
              <h2 id="cw-h" style={{ fontSize: "var(--fs-xl)" }}>{harder ? "Take a minute for yourself" : "A small reset, whenever you want one"}</h2>
              <p className="muted" style={{ margin: 0 }}>Suggested now: <strong>{top.tool.name}</strong> · {top.tool.minutes} min. {top.reason}</p>
              <div className="row">
                <Link href={`/support/${top.tool.id}`} className="btn big">Open Calm Window</Link>
                <Link href="/support" className="btn ghost">Other options</Link>
              </div>
              <ul className="alt-list">
                {recommendations.slice(1, 3).map((r) => (
                  <li key={r.tool.id}><Link href={`/support/${r.tool.id}`}><strong>{r.tool.name}</strong> · {r.tool.minutes} min</Link><span className="faint"> — {r.reason}</span></li>
                ))}
              </ul>
            </section>
          </div>

          {showInvite && <SetupInvite resume={s.settings.deviceSetup === "in-progress"} />}

          <section className="card" id="radar" aria-labelledby="radar-h">
            <div className="section-title"><h2 id="radar-h">Early Shift Radar</h2><span className="faint">Slow changes against your usual</span></div>
            {!radar.ready ? <p className="muted" style={{ margin: 0 }}>{radar.note}</p>
              : radar.signals.length === 0 ? <p className="muted" style={{ margin: 0 }}>Nothing drifting. Your last few days look like your usual patterns.</p>
              : (
                <div className="stack lg">
                  {radar.signals.map((sig) => (
                    <div key={sig.id} className={`signal sev-${sig.severity}`}>
                      <div className="row" style={{ gap: 8 }}><strong>{sig.title}</strong><span className={`pill sev-${sig.severity}`}>{SEVERITY_LABEL[sig.severity]}</span></div>
                      <p style={{ margin: "6px 0" }}>{sig.detail}</p>
                      <p className="muted" style={{ margin: "6px 0" }}><em>Why it matters:</em> {sig.why} <strong>Try:</strong> {sig.suggestion}</p>
                      {sig.evidence.length > 0 && <details><summary>Show the data</summary><ul>{sig.evidence.map((e) => <li key={e}>{e}</li>)}</ul></details>}
                    </div>
                  ))}
                </div>
              )}
          </section>

          {week.length >= 3 && (
            <section className="card" aria-labelledby="wk-h">
              <div className="section-title"><h2 id="wk-h">Last two weeks</h2><Link href="/patterns" className="faint">All patterns →</Link></div>
              <LineChart
                ariaLabel="Stress, mood and energy over the last two weeks"
                width={520}
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
            <section className="card" style={{ borderColor: "var(--stretch)" }} aria-labelledby="pro-h">
              <h2 id="pro-h">It&apos;s been a hard couple of weeks</h2>
              <p>{s.hardDays14} of your last 14 check-ins were outside your usual range. That&apos;s a lot to carry, and it can really help to talk it through with someone — a person you trust, or a professional.</p>
              <Link href="/circle" className="btn ghost">See options for support</Link>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
