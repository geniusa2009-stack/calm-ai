import { listMemories, listCheckIns } from "@/lib/db";
import { MemoryClient } from "./MemoryClient";
import { DemoBanner } from "@/components/DemoBanner";

export const dynamic = "force-dynamic";

export default function MemoryPage() {
  const memories = listMemories();
  const demo = listCheckIns(60).some((c) => c.source === "demo");
  return (
    <div className="stack" style={{ maxWidth: 760 }}>
      {demo && <DemoBanner />}
      <div className="head">
        <h1>Memory</h1>
        <p>The things worth carrying forward: what helps, what to watch for, and wins you don&apos;t want to forget. Pinned items are what Calm (and the companion, if you allow it) treat as most important. Calm adds an entry when a support session clearly works.</p>
      </div>
      <MemoryClient memories={memories} />
    </div>
  );
}
