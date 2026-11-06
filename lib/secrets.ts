import crypto from "node:crypto";

/**
 * Encryption at rest for provider tokens (AES-256-GCM, random 96-bit IV per value,
 * authenticated). The key comes from CALM_TOKEN_KEY (32 random bytes, base64) and never
 * leaves the server. Without a key, integrations that need stored tokens are disabled.
 */
const PREFIX = "v1";

export function tokenKey(): Buffer | null {
  const raw = process.env.CALM_TOKEN_KEY;
  if (!raw) return null;
  const key = Buffer.from(raw, "base64");
  return key.length === 32 ? key : null;
}

export function encryptSecret(plain: string, key = tokenKey()): string {
  if (!key) throw new Error("CALM_TOKEN_KEY is not configured");
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [PREFIX, iv.toString("base64url"), c.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}

export function decryptSecret(blob: string, key = tokenKey()): string {
  if (!key) throw new Error("CALM_TOKEN_KEY is not configured");
  const [v, iv, tag, ct] = blob.split(".");
  if (v !== PREFIX || !iv || !tag || !ct) throw new Error("Malformed secret");
  const d = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
}
