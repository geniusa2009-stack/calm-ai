import { Skeleton } from "@/components/ui";

/** Shown while a server-rendered page loads. */
export default function Loading() {
  return (
    <div className="stack lg" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="stack" style={{ gap: 10 }}><Skeleton h={12} w={90} /><Skeleton h={32} w="45%" /><Skeleton h={16} w="70%" /></div>
      <div className="grid g2">
        <div className="card stack"><Skeleton h={150} w={150} r={999} /><Skeleton h={14} w="60%" /></div>
        <div className="card stack"><Skeleton h={20} w="50%" /><Skeleton h={14} /><Skeleton h={14} w="80%" /><Skeleton h={44} w={180} r={999} /></div>
      </div>
      <div className="card stack"><Skeleton h={18} w="30%" /><Skeleton h={120} /></div>
    </div>
  );
}
