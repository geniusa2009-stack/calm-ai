import type { Resource } from "@/lib/safety";
import { CRISIS_MESSAGE } from "@/lib/safety";

export function CrisisCard({ resources }: { resources: Resource[] }) {
  return (
    <div className="crisis stack" role="alert">
      <strong>You don&apos;t have to handle this alone.</strong>
      <p style={{ margin: 0 }}>{CRISIS_MESSAGE}</p>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {resources.map((r) => (
          <li key={r.name}><strong>{r.name}</strong> — {r.href ? <a href={r.href}>{r.contact}</a> : r.contact} <span className="faint">({r.detail})</span></li>
        ))}
      </ul>
    </div>
  );
}
