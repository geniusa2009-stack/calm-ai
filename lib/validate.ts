export class BadRequest extends Error {}

export function int(v: unknown, name: string, lo: number, hi: number, optional = false): number | null {
  if (v === null || v === undefined || v === "") {
    if (optional) return null;
    throw new BadRequest(`${name} is required`);
  }
  const n = Number(v);
  if (!Number.isFinite(n) || n < lo || n > hi) throw new BadRequest(`${name} must be between ${lo} and ${hi}`);
  return Math.round(n);
}

export function num(v: unknown, name: string, lo: number, hi: number, optional = false): number | null {
  if (v === null || v === undefined || v === "") {
    if (optional) return null;
    throw new BadRequest(`${name} is required`);
  }
  const n = Number(v);
  if (!Number.isFinite(n) || n < lo || n > hi) throw new BadRequest(`${name} must be between ${lo} and ${hi}`);
  return n;
}

export function str(v: unknown, name: string, max: number, optional = false): string | null {
  if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) {
    if (optional) return null;
    throw new BadRequest(`${name} is required`);
  }
  if (typeof v !== "string") throw new BadRequest(`${name} must be text`);
  return v.trim().slice(0, max);
}

export function oneOf<T extends string>(v: unknown, name: string, options: readonly T[]): T {
  if (typeof v !== "string" || !options.includes(v as T)) throw new BadRequest(`${name} must be one of ${options.join(", ")}`);
  return v as T;
}
