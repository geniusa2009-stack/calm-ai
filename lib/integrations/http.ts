export const providerFromPath = (req: Request) => decodeURIComponent(new URL(req.url).pathname.split("/")[3] ?? "");

export function publicOrigin(req: Request) {
  const configured = process.env.CALM_PUBLIC_URL;
  if (configured) { try { return new URL(configured).origin; } catch { /* fall through */ } }
  return new URL(req.url).origin;
}
export const redirectUri = (req: Request, provider: string) => `${publicOrigin(req)}/api/integrations/${encodeURIComponent(provider)}/callback`;
