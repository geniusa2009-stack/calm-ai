import { listCheckIns } from "@/lib/db";
import { PageHeader, EmptyState } from "@/components/ui";
import { requireUser } from "@/lib/session";
import { groupByDay } from "@/lib/engine/days";
import { LabClient } from "./LabClient";

export const dynamic = "force-dynamic";

export default async function LabPage() {
  const user = await requireUser();
  const days = groupByDay(listCheckIns(user.id));
  const freq = new Map<string, number>();
  days.forEach((d) => d.tags.forEach((t) => freq.set(t, (freq.get(t) ?? 0) + 1)));
  const tags = [...freq.entries()].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).map(([t]) => t).slice(0, 12);
  return (
    <div className="stack lg" style={{ gap: 24 }}>
      <PageHeader eyebrow="Understand" title={<>What-If Lab</>} lead=<>Play with small changes and see what your own patterns suggest. It&apos;s a thinking tool — the estimates are deliberately cautious and built only from your history.</> />
      <LabClient tags={tags} />
    </div>
  );
}
