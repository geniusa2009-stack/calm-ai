import type { PulseState } from "@/lib/engine/pulse";
export { PulseRing } from "./PulseRing";

export const STATE_COLOR: Record<PulseState, string> = {
  learning: "var(--ink-3)", "no-recent": "var(--ink-3)", bright: "var(--bright)", steady: "var(--calm)", stretched: "var(--stretch)",
  strained: "var(--strain)", "running-low": "var(--low)", recovering: "var(--calm)",
};

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
