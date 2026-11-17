import type { RawReading } from "../signals/types";

export interface OAuthProvider {
  id: string;
  name: string;
  authorizeUrl: string;
  tokenUrl: string;
  revokeUrl?: string;
  scopes: string[];
  pkce: boolean;
  clientIdEnv: string;
  clientSecretEnv: string;
  docs: string;
  externallyVerified: boolean;
  fetchPage(ctx: FetchCtx): Promise<{ readings: RawReading[]; nextCursor: string | null; rejected: number }>;
}

export interface FetchCtx {
  accessToken: string;
  since: Date;
  until: Date;
  cursor: string | null;
  fetch: typeof fetch;
}

export type ConnectionStatus = "connected" | "reauth_required" | "error";

export class ProviderHttpError extends Error {
  constructor(public status: number, public retryAfterSec: number | null, message: string) { super(message); }
}
