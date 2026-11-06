import { IntegrationError, providerOr404, syncProvider } from "@/lib/integrations/oauth";
import { providerFromPath } from "@/lib/integrations/http";
import { json, route } from "@/lib/http";
import { db } from "@/lib/db";

const MIN_INTERVAL_MS = 5 * 60e3; // per-user rate limit on manual sync

export const POST = route(async (req, { user }) => {
  const p = providerOr404(providerFromPath(req));
  const row = db().prepare("SELECT last_sync_at FROM provider_connections WHERE user_id = ? AND provider = ?").get(user.id, p.id) as { last_sync_at: string | null } | undefined;
  if (row?.last_sync_at && Date.now() - Date.parse(row.last_sync_at) < MIN_INTERVAL_MS) return json({ error: "Synced recently — try again in a few minutes." }, { status: 429 });
  try {
    const r = await syncProvider(user.id, p);
    return { report: { inserted: r.inserted, updated: r.updated, duplicates: r.duplicates, rejected: r.rejected.length + r.providerRejected, pages: r.pages } };
  } catch (e) {
    if (e instanceof IntegrationError) return json({ error: e.message, code: e.code }, { status: e.status });
    throw e;
  }
});
