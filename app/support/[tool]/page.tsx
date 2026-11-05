import { notFound } from "next/navigation";
import Link from "next/link";
import { toolById } from "@/lib/engine/support";
import { snapshot } from "@/lib/snapshot";
import { requireUser } from "@/lib/session";
import { Runner } from "./Runner";

export const dynamic = "force-dynamic";

export default async function ToolPage({ params }: { params: Promise<{ tool: string }> }) {
  const user = await requireUser();
  const tool = toolById((await params).tool);
  if (!tool) notFound();
  const s = snapshot(user.id);
  const last = s.checkins.at(-1);
  const rec = s.recommendations.find((r) => r.tool.id === tool.id)!;
  return (
    <div className="stack" style={{ maxWidth: 680 }}>
      <Link href="/support" className="faint">← All support</Link>
      <div className="head">
        <h1>{tool.name}</h1>
        <p>{tool.summary}</p>
        <span className="faint">{rec.reason}</span>
      </div>
      <Runner tool={tool} initialStress={last?.stress ?? 5} />
    </div>
  );
}
