import { listCheckIns, listMemories, listSessions } from "@/lib/db";
import { buildSummary } from "@/lib/summary";
import { route } from "@/lib/http";
import { getSettings } from "@/lib/db";
import { formatInstant, resolveTimeZone } from "@/lib/time";
export const dynamic = "force-dynamic";
export const GET = route((_req, { user }) => {
  const tz = resolveTimeZone(getSettings(user.id).timezone);
  const s = buildSummary(listCheckIns(user.id, 60), listSessions(user.id, 90), listMemories(user.id), new Date(), tz);
  const text = `Calm AI — wellbeing summary (self-reported, not a clinical assessment)\nGenerated ${formatInstant(new Date(), tz, { dateStyle: "long" })} (${tz})\n\n${s.text}\n\nContext tags used: ${s.tagsUsed.join(", ") || "none"}\n`;
  return new Response(text, { headers: { "content-type": "text/plain; charset=utf-8" } });
});
