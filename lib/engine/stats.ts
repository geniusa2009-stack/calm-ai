export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

export function sd(xs: number[]) {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

export function median(xs: number[]) {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Robust spread: scaled median absolute deviation, blended with SD so it is never degenerate. */
export function robustSpread(xs: number[], floor: number) {
  if (xs.length < 2) return floor;
  const m = median(xs);
  const mad = median(xs.map((x) => Math.abs(x - m))) * 1.4826;
  const s = sd(xs);
  return Math.max(floor, Number.isFinite(s) ? (mad + s) / 2 : mad);
}

export function ewma(xs: number[], alpha = 0.4) {
  let v = NaN;
  for (const x of xs) v = Number.isNaN(v) ? x : alpha * x + (1 - alpha) * v;
  return v;
}

/** Least-squares slope per step. */
export function slope(ys: number[]) {
  const n = ys.length;
  if (n < 3) return 0;
  const xm = (n - 1) / 2;
  const ym = mean(ys);
  let num = 0, den = 0;
  ys.forEach((y, i) => { num += (i - xm) * (y - ym); den += (i - xm) ** 2; });
  return den ? num / den : 0;
}

export function pearson(xs: number[], ys: number[]) {
  const n = Math.min(xs.length, ys.length);
  if (n < 5) return NaN;
  const mx = mean(xs.slice(0, n)), my = mean(ys.slice(0, n));
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  return dx && dy ? num / Math.sqrt(dx * dy) : NaN;
}

/** Simple OLS fit y = a + b x. */
export function linreg(xs: number[], ys: number[]) {
  const mx = mean(xs), my = mean(ys);
  let num = 0, den = 0;
  xs.forEach((x, i) => { num += (x - mx) * (ys[i] - my); den += (x - mx) ** 2; });
  const b = den ? num / den : 0;
  return { a: my - b * mx, b };
}

export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
export const round = (x: number, d = 1) => Math.round(x * 10 ** d) / 10 ** d;

// ---------- inference helpers ----------

function lnGamma(x: number): number {
  // Lanczos approximation (g = 7, n = 9)
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Continued fraction for the regularized incomplete beta (Numerical Recipes `betacf`). */
function betacf(a: number, b: number, x: number) {
  const MAXIT = 200, EPS = 3e-14, FPMIN = 1e-300;
  let c = 1, d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((a - 1 + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + 1 + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Regularized incomplete beta I_x(a, b). */
export function incBeta(x: number, a: number, b: number) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b;
}

/** Two-sided p-value for Student's t with `df` degrees of freedom. */
export function tPValue(t: number, df: number) {
  if (!Number.isFinite(t) || !(df > 0)) return 1;
  return incBeta(df / (df + t * t), df / 2, 0.5);
}

/** Welch's unequal-variance t-test. Returns t, Welch–Satterthwaite df and two-sided p. */
export function welch(a: number[], b: number[]) {
  if (a.length < 2 || b.length < 2) return { t: 0, df: 0, p: 1 };
  const va = sd(a) ** 2, vb = sd(b) ** 2;
  const sa = va / a.length, sb = vb / b.length;
  const se = Math.sqrt(sa + sb);
  if (!(se > 0)) return { t: 0, df: 0, p: 1 }; // identical constant groups: no evidence either way
  const t = (mean(a) - mean(b)) / se;
  const df = (sa + sb) ** 2 / ((sa ** 2) / (a.length - 1) + (sb ** 2) / (b.length - 1));
  return { t, df, p: tPValue(t, df) };
}

/** p-value for a Pearson correlation r over n pairs. */
export function pearsonP(r: number, n: number) {
  if (!Number.isFinite(r) || n < 4) return 1;
  if (Math.abs(r) >= 1) return 0;
  return tPValue(r * Math.sqrt((n - 2) / (1 - r * r)), n - 2);
}

/** Benjamini–Hochberg adjusted p-values (q-values), in the input order. */
export function bhAdjust(ps: number[]) {
  const m = ps.length;
  const order = ps.map((p, i) => [p, i] as const).sort((x, y) => x[0] - y[0]);
  const q = new Array<number>(m);
  let prev = 1;
  for (let k = m - 1; k >= 0; k--) {
    const [p, i] = order[k];
    prev = Math.min(prev, (p * m) / (k + 1));
    q[i] = prev;
  }
  return q;
}
