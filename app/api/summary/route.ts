import { listCheckIns, listMemories, listSessions } from "@/lib/db";
import { buildSummary } from "@/lib/summary";
import { route } from "@/lib/http";
export const dynamic = "force-dynamic";
export const GET = route((_req, { user }) => {
  const s = buildSummary(listCheckIns(user.id, 60), listSessions(user.id, 90), listMemories(user.id));
  const text = `Calm AI — wellbeing summary (self-reported, not a clinical assessment)\nGenerated ${new Date().toLocaleDateString()}\n\n${s.text}\n\nContext tags used: ${s.tagsUsed.join(", ") || "none"}\n`;
  return new Response(text, { headers: { "content-type": "text/plain; charset=utf-8" } });
});
