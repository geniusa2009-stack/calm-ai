import { completeAuthorization, IntegrationError, providerOr404, syncProvider } from "@/lib/integrations/oauth";
import { providerFromPath } from "@/lib/integrations/http";
import { route } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Provider redirects back here. The session cookie (SameSite=Lax) is sent on this top-level
 * navigation; state must match THIS user. Errors are reported by code only.
 */
export const GET = route(async (req, { user }) => {
  const url = new URL(req.url);
  const p = providerOr404(providerFromPath(req));
  const back = (q: string) => Response.redirect(new URL(`/settings?${q}#signals`, req.url), 303);
  if (url.searchParams.get("error")) return back(`integration=${p.id}&result=declined`);
  try {
    await completeAuthorization(user.id, p, url.searchParams.get("state"), url.searchParams.get("code"));
  } catch (e) {
    return back(`integration=${p.id}&result=${e instanceof IntegrationError ? e.code : "failed"}`);
  }
  await syncProvider(user.id, p).catch(() => { /* first sync can be retried from Settings */ });
  return back(`integration=${p.id}&result=connected`);
});
