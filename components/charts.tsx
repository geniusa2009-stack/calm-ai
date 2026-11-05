import type { PulseState } from "@/lib/engine/pulse";

export const STATE_COLOR: Record<PulseState, string> = {
  learning: "var(--ink-3)", bright: "var(--bright)", steady: "var(--calm)", stretched: "var(--stretch)",
  strained: "var(--strain)", "running-low": "var(--low)", recovering: "var(--calm)",
};

/** Calm Pulse gauge: an arc where the tick marks "your usual". */
export function PulseRing({ score, state, size = 200 }: { score: number; state: PulseState; size?: number }) {
  const r = size / 2 - 14, c = size / 2;
  const start = 135, sweep = 270;
  const pt = (deg: number) => {
    const a = (deg * Math.PI) / 180;
    return [c + r * Math.cos(a), c + r * Math.sin(a)];
  };
  const arc = (from: number, to: number) => {
    const [x1, y1] = pt(from), [x2, y2] = pt(to);
    return `M ${x1} ${y1} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2} ${y2}`;
  };
  const end = start + (sweep * Math.max(0.5, score)) / 100;
  const usual = start + sweep * 0.6;
  const [ux1, uy1] = [c + (r - 12) * Math.cos((usual * Math.PI) / 180), c + (r - 12) * Math.sin((usual * Math.PI) / 180)];
  const [ux2, uy2] = [c + (r + 12) * Math.cos((usual * Math.PI) / 180), c + (r + 12) * Math.sin((usual * Math.PI) / 180)];
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Calm Pulse ${score} of 100; 60 is your usual`}>
      <path d={arc(start, start + sweep)} stroke="var(--surface-2)" strokeWidth={14} fill="none" strokeLinecap="round" />
      {state !== "learning" && <path d={arc(start, end)} stroke={STATE_COLOR[state]} strokeWidth={14} fill="none" strokeLinecap="round" />}
      <line x1={ux1} y1={uy1} x2={ux2} y2={uy2} stroke="var(--ink-3)" strokeWidth={2} />
      <text x={c} y={c + 4} textAnchor="middle" fontSize={size * 0.22} fontWeight={700} fill="var(--ink)">{state === "learning" ? "·" : score}</text>
      <text x={c} y={c + size * 0.17} textAnchor="middle" fontSize={11} fill="var(--ink-3)">{state === "learning" ? "learning" : "tick = your usual"}</text>
    </svg>
  );
}

export interface Series { label: string; color: string; values: (number | null)[]; dashed?: boolean }

/** Multi-series line chart with an optional shaded "usual" band. */
export function LineChart({ labels, series, band, min = 1, max = 10, height = 200, width = 640, ariaLabel }: {
  labels: string[]; series: Series[]; band?: { lo: number; hi: number; color: string }; min?: number; max?: number; height?: number; width?: number; ariaLabel: string;
}) {
  const W = width, H = height, P = { l: 28, r: 18, t: 10, b: 22 };
  const n = labels.length;
  const x = (i: number) => P.l + (n <= 1 ? 0 : (i * (W - P.l - P.r)) / (n - 1));
  const y = (v: number) => P.t + ((max - v) * (H - P.t - P.b)) / (max - min);
  const path = (vals: (number | null)[]) => {
    let d = "", pen = false;
    vals.forEach((v, i) => {
      if (v == null) { pen = false; return; }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
      pen = true;
    });
    return d;
  };
  const ticks = [min, (min + max) / 2, max];
  const every = Math.max(1, Math.ceil(n / (W < 500 ? 4 : 7)));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={ariaLabel} style={{ display: "block" }}>
      {band && <rect x={P.l} width={W - P.l - P.r} y={y(band.hi)} height={Math.max(0, y(band.lo) - y(band.hi))} fill={band.color} opacity={0.5} rx={4} />}
      {ticks.map((t) => (
        <g key={t}>
          <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
          <text x={P.l - 6} y={y(t) + 4} textAnchor="end" fontSize={10} fill="var(--ink-3)">{Math.round(t * 10) / 10}</text>
        </g>
      ))}
      {labels.map((l, i) => (i % every === 0 || (i === n - 1 && (n - 1) % every > every / 2)) && (
        <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize={10} fill="var(--ink-3)">{l}</text>
      ))}
      {series.map((s) => (
        <path key={s.label} d={path(s.values)} fill="none" stroke={s.color} strokeWidth={2.2} strokeDasharray={s.dashed ? "4 4" : undefined} strokeLinejoin="round" strokeLinecap="round" />
      ))}
    </svg>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return <div className="legend">{items.map((i) => <span key={i.label}><i style={{ background: i.color }} />{i.label}</span>)}</div>;
}
