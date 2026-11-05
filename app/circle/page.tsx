import { snapshot } from "@/lib/snapshot";
import { PageHeader, EmptyState } from "@/components/ui";
import { listCircle } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { crisisResources } from "@/lib/safety";
import { CircleClient } from "./CircleClient";

export const dynamic = "force-dynamic";

export default async function CirclePage() {
  const user = await requireUser();
  const s = snapshot(user.id);
  const resources = crisisResources(s.settings.region);
  return (
    <div className="stack lg" style={{ gap: 24, maxWidth: 820 }}>
      <PageHeader eyebrow="People" title={<>Circle &amp; help</>} lead=<>Apps are good for small resets. People are better for the big stuff. This is where Calm points you toward them.</> />

      <section className="card stack" aria-labelledby="tc-h">
        <h2 id="tc-h">Trusted circle</h2>
        <CircleClient circle={listCircle(user.id)} />
      </section>

      <section className="card stack" aria-labelledby="pb-h" style={s.suggestProfessional ? { borderColor: "var(--stretch)" } : undefined}>
        <h2 id="pb-h">Professional bridge</h2>
        {s.suggestProfessional
          ? <p>{s.hardDays14} of your last 14 check-ins were outside your usual range. When things stay hard for a couple of weeks, talking to a GP, counsellor or therapist can really help — and it&apos;s not a sign that anything is &ldquo;wrong&rdquo; with you.</p>
          : <p className="muted">If things ever stay hard for weeks, or start affecting sleep, work, study or relationships, a GP, counsellor or therapist is a good next step.</p>}
        <p className="muted">Many people find the first appointment easier with notes. Calm can prepare a plain summary of your recent check-ins that <strong>you</strong> choose whether to share. It&apos;s self-reported data, not a clinical assessment.</p>
        <div className="row">
          <a href="/api/summary" target="_blank" rel="noreferrer" className="btn ghost">Open my summary</a>
          <a href="/api/export" className="btn ghost">Download all my data</a>
        </div>
      </section>

      <section className="card stack" aria-labelledby="cr-h">
        <h2 id="cr-h">If you need help right now</h2>
        <p>If you&apos;re in danger or thinking about harming yourself, please call your local emergency number or reach out to one of these free, confidential services:</p>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {resources.map((r) => <li key={r.name}><strong>{r.name}</strong> — {r.href ? <a href={r.href}>{r.contact}</a> : r.contact} <span className="faint">({r.detail})</span></li>)}
        </ul>
        <span className="faint">Showing services for your region — change it in Settings.</span>
      </section>
    </div>
  );
}
