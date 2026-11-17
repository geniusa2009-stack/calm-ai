import { getSettings } from "@/lib/db";
import { snapshot } from "@/lib/snapshot";
import { route } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = route((_req, { user }) => {
  if (!getSettings(user.id).notifyEnabled) return { nudges: [] };
  const s = snapshot(user.id);
  return { nudges: s.nudges.map((n) => ({ id: n.id, kind: n.id === "checkin" ? "checkin" : n.tone === "celebrate" ? "positive" : "radar" })) };
});
