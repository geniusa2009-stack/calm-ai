import { getSettings, listMemories } from "@/lib/db";
import { resolveTimeZone } from "@/lib/time";
import { PageHeader, EmptyState } from "@/components/ui";
import { requireUser } from "@/lib/session";
import { MemoryClient } from "./MemoryClient";
import { DemoBanner } from "@/components/DemoBanner";

export const dynamic = "force-dynamic";
export const metadata = { title: "Memory" };

export default async function MemoryPage() {
  const user = await requireUser();
  const memories = listMemories(user.id);
  const demo = user.isDemo;
  return (
    <div className="stack" style={{ maxWidth: 760 }}>
      {demo && <DemoBanner />}
      <PageHeader eyebrow="Understand" title={<>Memory</>} lead=<>The things worth carrying forward: what helps, what to watch for, and wins you don&apos;t want to forget. Pinned items are what Calm (and the companion, if you allow it) treat as most important. Calm adds an entry when a support session clearly works.</> />
      <MemoryClient memories={memories} tz={resolveTimeZone(getSettings(user.id).timezone)} />
    </div>
  );
}
