import Link from "next/link";
import { PageHeader, EmptyState } from "@/components/ui";
import { snapshot } from "@/lib/snapshot";
import { requireUser } from "@/lib/session";
import { DemoBanner } from "@/components/DemoBanner";

export const dynamic = "force-dynamic";
export const metadata = { title: "Support" };

export default async function SupportPage() {
  const user = await requireUser();
  const s = snapshot(user.id);
  const recs = s.recommendations;
  return (
    <div className="stack lg" style={{ gap: 24 }}>
      {user.isDemo && <DemoBanner />}
      <PageHeader eyebrow="Support" title={<>Support</>} lead=<>Ranked for how you&apos;re doing right now ({s.pulse.label.toLowerCase()}), the time of day, your mode, and — most of all — what has actually helped <em>you</em> before. Rate each session afterwards and the ranking keeps learning.</> />
      <div className="grid g2 stagger">
        {recs.map((r, i) => (
          <Link key={r.tool.id} href={`/support/${r.tool.id}`} className={`card tool-card ${i === 0 ? "featured" : ""}`}>
            <div className="row between">
              <strong style={{ fontSize: "1.05rem" }}>{r.tool.name}</strong>
              <span className="faint">{r.tool.minutes} min{i === 0 ? " · best fit now" : ""}</span>
            </div>
            <span className="muted">{r.tool.summary}</span>
            <span className="faint">{r.reason}</span>
            {r.personal.sessions > 0 && (
              <span className="faint">Used {r.personal.sessions}×{r.personal.avgDrop != null ? ` · avg stress change ${r.personal.avgDrop > 0 ? "−" : "+"}${Math.abs(r.personal.avgDrop)}` : ""}</span>
            )}
          </Link>
        ))}
      </div>
      <div className="card">
        <h2>Prefer to talk?</h2>
        <p className="muted">Reaching out to someone you trust is often the most effective support there is.</p>
        <div className="row">
          <Link href="/circle" className="btn ghost">My trusted circle</Link>
          {s.settings.companionEnabled && <Link href="/companion" className="btn ghost">Talk it through with the companion</Link>}
        </div>
      </div>
    </div>
  );
}
