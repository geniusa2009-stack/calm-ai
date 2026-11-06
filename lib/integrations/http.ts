/** Helpers shared by the integration routes. */
export const providerFromPath = (req: Request) => decodeURIComponent(new URL(req.url).pathname.split("/")[3] ?? "");

/** Public base URL for OAuth redirect URIs. Prefer configuration over the request's Host header. */
export function publicOrigin(req: Request) {
  const configured = process.env.CALM_PUBLIC_URL;
  if (configured) { try { return new URL(configured).origin; } catch { /* fall through */ } }
  return new URL(req.url).origin;
}
export const redirectUri = (req: Request, provider: string) => `${publicOrigin(req)}/api/integrations/${encodeURIComponent(provider)}/callback`;
