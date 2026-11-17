import { connectionInfo, disconnect, providerOr404 } from "@/lib/integrations/oauth";
import { providerFromPath } from "@/lib/integrations/http";
import { route } from "@/lib/http";

export const GET = route((req, { user }) => {
  const p = providerOr404(providerFromPath(req));
  return { connection: connectionInfo(user.id).find((c) => c.provider === p.id) ?? null };
});

export const DELETE = route(async (req, { user }) => {
  const p = providerOr404(providerFromPath(req));
  const { revoked } = await disconnect(user.id, p, { deleteData: new URL(req.url).searchParams.get("deleteData") === "1" });
  return { ok: true, revoked };
});
