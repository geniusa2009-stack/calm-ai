import { exportAll } from "@/lib/db";
import { route } from "@/lib/http";
import { connectionInfo } from "@/lib/integrations/oauth";
import { listSubscriptionsPublic } from "@/lib/push/store";
export const dynamic = "force-dynamic";
export const GET = route((_req, { user }) =>
  new Response(JSON.stringify({ ...exportAll(user.id), integrations: connectionInfo(user.id), pushSubscriptions: listSubscriptionsPublic(user.id) }, null, 2), {
    headers: { "content-type": "application/json", "content-disposition": `attachment; filename="calm-ai-export-${new Date().toISOString().slice(0, 10)}.json"` },
  }));
