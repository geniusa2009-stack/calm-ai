import { listCheckIns, listMemories, listSessions } from "@/lib/db";
import { buildSummary } from "@/lib/summary";
export const dynamic = "force-dynamic";
export function GET() {
  const s = buildSummary(listCheckIns(60), listSessions(90), listMemories());
  const text = `Calm AI — wellbeing summary (self-reported, not a clinical assessment)\nGenerated ${new Date().toLocaleDateString()}\n\n${s.text}\n\nContext tags used: ${s.tagsUsed.join(", ") || "none"}\n`;
  return new Response(text, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
