import Link from "next/link";
import { patternsSnapshot } from "@/lib/snapshot";
import { PageHeader, EmptyState } from "@/components/ui";
import { requireUser } from "@/lib/session";
import { insightFeedback } from "@/lib/db";
import { tagEffects, sleepLinks, weekdayPatterns } from "@/lib/engine/context";
import { toolEfficacy, toolById } from "@/lib/engine/support";
import { LineChart, Legend } from "@/components/charts";
import { DemoBanner } from "@/components/DemoBanner";
import { InsightFeedback } from "./InsightFeedback";

export const dynamic = "force-dynamic";
const short = (d: string) => new Date(d + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });

export default async function PatternsPage() {
  const user = await requireUser();
  const s = patternsSnapshot(user.id);
  const fb = insightFeedback(user.id);
  const days = s.days.slice(-42);
  const b = s.pulse.baseline;
  const effects = tagEffects(s.days);
  const sleep = sleepLinks(s.days);
  const weekdays = weekdayPatterns(s.days);
  const eff = Object.values(toolEfficacy(s.sessions)).filter((e) => e.sessions > 0).sort((a, c) => c.score - a.score);
  const series = s.series.slice(-42);

  if (s.days.length < 3) {
    return (
      <div className="stack lg">
        <PageHeader eyebrow="Understand" title="Patterns" />
        <EmptyState icon="∿" title="Patterns appear as you check in" action={<Link href="/check-in" className="btn">Check in now</Link>}>
          After about a week Calm can show your usual ranges; after two, it starts linking context to how you feel. {s.days.length} of ~7 days so far.
        </EmptyState>
        <div className="progress" aria-label="Days logged" role="progressbar" aria-valuemin={0} aria-valuemax={7} aria-valuenow={s.days.length}><span style={{ transform: `scaleX(${Math.min(1, s.days.length / 7)})` }} /></div>
      </div>
    );
  }

  return (
    <div className="stack lg stagger">
      {user.isDemo && <DemoBanner />}
      <PageHeader eyebrow="Understand" title={<>Patterns</>} lead=<>What Calm has learned about you so far. These are associations from your own check-ins — useful hints, not diagnoses or proven causes. Tell Calm when something doesn&apos;t fit.</> />

      {s.insights.length > 0 && (
        <section className="stack" aria-labelledby="ins-h">
          <h2 id="ins-h">This week&apos;s insights</h2>
          <div className="grid g2">
            {s.insights.map((i) => (
              <div key={i.key} className="card stack" style={{ gap: 8 }}>
                <div className="row between"><strong>{i.title}</strong><span className={`pill ${i.confidence}`}>{i.confidence}</span></div>
                <p className="muted" style={{ margin: 0 }}>{i.body}</p>
                <InsightFeedback k={i.key} current={fb[i.key] ?? 0} />
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card" aria-labelledby="trend-h">
        <h2 id="trend-h">Six-week trend</h2>
        <LineChart ariaLabel="Stress, mood and energy over six weeks" labels={days.map((d) => short(d.date))}
          band={{ lo: b.stress.center - b.stress.spread, hi: b.stress.center + b.stress.spread, color: "var(--care-soft)" }}
          series={[
            { label: "Stress", color: "var(--strain)", values: days.map((d) => d.stress) },
            { label: "Mood", color: "var(--calm)", values: days.map((d) => d.mood) },
            { label: "Energy", color: "var(--low)", values: days.map((d) => d.energy), dashed: true },
          ]} />
        <Legend items={[{ label: "Stress", color: "var(--strain)" }, { label: "Mood", color: "var(--calm)" }, { label: "Energy", color: "var(--low)" }, { label: "Usual stress range", color: "var(--care-soft)" }]} />
        <p className="faint" style={{ marginTop: 8 }}>Your usual: stress ≈ {b.stress.center.toFixed(1)}, mood ≈ {b.mood.center.toFixed(1)}, energy ≈ {b.energy.center.toFixed(1)} · learned from {b.stress.n} days</p>
      </section>

      <div className="grid g2">
        <section className="card" aria-labelledby="sleep-h">
          <h2 id="sleep-h">Sleep</h2>
          <LineChart ariaLabel="Hours of sleep" min={3} max={10} height={190} width={340} labels={days.map((d) => short(d.date))}
            band={{ lo: b.sleepHours.center - b.sleepHours.spread, hi: b.sleepHours.center + b.sleepHours.spread, color: "var(--info-soft)" }}
            series={[{ label: "Sleep", color: "var(--low)", values: days.map((d) => d.sleepHours) }]} />
          {sleep.length ? (
            <>
              <p style={{ marginTop: 10 }}>{sleep[0].text}</p>
              {sleep.length > 1 && <p className="faint">Also linked: {sleep.slice(1).map((l) => `${l.metric} (${l.perHour > 0 ? "+" : "−"}${Math.abs(l.perHour)} per hour)`).join(", ")}.</p>}
            </>
          ) : <p className="muted">No clear link between sleep and how you feel yet.</p>}
        </section>
        <section className="card" aria-labelledby="strain-h">
          <h2 id="strain-h">Distance from your usual</h2>
          <LineChart ariaLabel="Daily strain relative to your usual" min={-2} max={3} height={190} width={340} labels={series.map((x) => short(x.date))}
            band={{ lo: -0.75, hi: 0.75, color: "var(--accent-soft)" }}
            series={[{ label: "Strain", color: "var(--stretch)", values: series.map((x) => x.strain) }]} />
          <p className="faint">0 = your usual. Above the band means harder than usual; below means better.</p>
          <p>{s.recovery.text}</p>
        </section>
      </div>

      <section className="card" aria-labelledby="ctx-h">
        <h2 id="ctx-h">Context that seems to matter for you</h2>
        {effects.length === 0 ? <p className="muted">Tag your check-ins (deadlines, exercise, late screens…) and Calm will start to see what moves the needle for you. It needs each tag at least 3 times.</p> : (
          <ul style={{ paddingLeft: 18, margin: 0 }} className="stack">
            {effects.slice(0, 10).map((e) => (
              <li key={e.key}>{e.text} <span className={`pill ${e.confidence}`}>{e.confidence === "low" ? "early hint" : e.confidence}</span></li>
            ))}
          </ul>
        )}
        {weekdays.length > 0 && <><h3 style={{ marginTop: 16 }}>Weekly rhythm</h3><ul style={{ paddingLeft: 18, margin: 0 }}>{weekdays.map((w) => <li key={w.weekday}>{w.text}</li>)}</ul></>}
      </section>

      {eff.length > 0 && (
        <section className="card" aria-labelledby="eff-h">
          <h2 id="eff-h">What helps you</h2>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.95rem" }}>
            <thead><tr style={{ textAlign: "left", color: "var(--ink-2)" }}><th scope="col">Tool</th><th scope="col">Sessions</th><th scope="col">Avg stress change</th><th scope="col">Found helpful</th></tr></thead>
            <tbody>
              {eff.map((e) => (
                <tr key={e.tool} style={{ borderTop: "1px solid var(--line)" }}>
                  <td style={{ padding: "8px 0" }}>{toolById(e.tool)!.name}</td><td>{e.sessions}</td>
                  <td>{e.avgDrop == null ? "—" : e.avgDrop > 0 ? `−${e.avgDrop}` : `+${Math.abs(e.avgDrop)}`}</td>
                  <td>{e.helpfulRate == null ? "—" : `${Math.round(e.helpfulRate * 100)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
