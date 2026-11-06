import { beginAuthorization, providerOr404 } from "@/lib/integrations/oauth";
import { providerFromPath, redirectUri } from "@/lib/integrations/http";
import { route } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Starts the OAuth flow for the signed-in user (explicit click from Settings). */
export const GET = route((req, { user }) => {
  if (user.isDemo) return Response.redirect(new URL("/settings?integration=demo#signals", req.url), 303);
  const p = providerOr404(providerFromPath(req));
  const { url } = beginAuthorization(user.id, p, redirectUri(req, p.id));
  return Response.redirect(url, 303);
});
