import type { RawReading } from "../signals/types";

/**
 * An OAuth2 cloud provider (e.g. Oura). Provider-specific code is limited to the config
 * and two pure functions — fetching a page and normalising it — so it can be tested with
 * recorded fixtures and never needs network access in tests.
 */
export interface OAuthProvider {
  id: string;
  name: string;
  /** Exact endpoints. Must be checked against the provider's current documentation. */
  authorizeUrl: string;
  tokenUrl: string;
  revokeUrl?: string;
  /** Narrowest scopes that cover the data Calm imports. */
  scopes: string[];
  pkce: boolean;
  clientIdEnv: string;
  clientSecretEnv: string;
  /** Where the provider's own docs say how this works — recorded for reviewers. */
  docs: string;
  /** Has the adapter been run against the real provider (sandbox or production)? */
  externallyVerified: boolean;
  /** Fetch one page of records since `since` (inclusive), continuing from `cursor`. */
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
