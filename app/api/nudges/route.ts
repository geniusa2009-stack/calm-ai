import { getSettings } from "@/lib/db";
import { snapshot } from "@/lib/snapshot";
import { route } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * What the notification bridge may announce. Returns only ids and a coarse kind —
 * never wellbeing details — and nothing at all if reminders are off. Quiet hours and
 * the per-mode cap are already applied by snapshot().
 */
export const GET = route((_req, { user }) => {
  if (!getSettings(user.id).notifyEnabled) return { nudges: [] };
  const s = snapshot(user.id);
  return { nudges: s.nudges.map((n) => ({ id: n.id, kind: n.id === "checkin" ? "checkin" : n.tone === "celebrate" ? "positive" : "radar" })) };
});
