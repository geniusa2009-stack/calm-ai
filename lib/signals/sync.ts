import type { User } from "../auth";
import { providerById } from "./providers";
import { ingest } from "./store";
import { AuthError } from "../auth";

/** Run a pull-style provider for one user. Refuses anything not actually implemented. */
export async function syncProvider(user: User, providerId: string, days = 42) {
  const p = providerById(providerId);
  if (!p) throw new AuthError("Unknown provider.", 400);
  if (p.status === "not-implemented") throw new AuthError(`${p.name} isn't available yet.`, 400);
  if (p.status === "demo" && !user.isDemo) throw new AuthError("Demo signals can only be used in a demo account.", 400);
  if (!p.fetchReadings) throw new AuthError(`${p.name} doesn't sync here; ${p.status === "oauth" ? "connect it from Settings" : "use import instead"}.`, 400);
  const until = new Date();
  const raw = await p.fetchReadings({ userId: user.id, since: new Date(until.getTime() - days * 864e5), until, isDemoAccount: user.isDemo });
  return ingest(user.id, p.id, raw);
}
