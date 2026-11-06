import type { PulseState } from "@/lib/engine/pulse";
export { PulseRing } from "./PulseRing";

export const STATE_COLOR: Record<PulseState, string> = {
  // Text colours for the state label: derived from the state hues to meet 4.5:1 (the ring keeps the exact hues).
  learning: "var(--text-faint)", "no-recent": "var(--text-faint)", bright: "var(--bright-text)", steady: "var(--calm-text)", stretched: "var(--stretch-text)",
  strained: "var(--strain-text)", "running-low": "var(--low-text)", recovering: "var(--calm-text)",
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
  const summary = describeSeries(series, labels, band);
  return (
    <figure className="chart">
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${ariaLabel}. ${summary}`} style={{ display: "block" }}>
      {band && <rect x={P.l} width={W - P.l - P.r} y={y(band.hi)} height={Math.max(0, y(band.lo) - y(band.hi))} fill={band.color} opacity={0.5} rx={4} />}
      {ticks.map((t) => (
        <g key={t}>
          <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
          <text x={P.l - 6} y={y(t) + 4} textAnchor="end" fontSize={10} fill="var(--text-faint)">{Math.round(t * 10) / 10}</text>
        </g>
      ))}
      {labels.map((l, i) => (i % every === 0 || (i === n - 1 && (n - 1) % every > every / 2)) && (
        <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize={10} fill="var(--text-faint)">{l}</text>
      ))}
      {series.map((s) => (
        <path key={s.label} d={path(s.values)} fill="none" stroke={s.color} strokeWidth={2.2} strokeDasharray={s.dashed ? "4 4" : undefined} strokeLinejoin="round" strokeLinecap="round" />
      ))}
    </svg>
      <figcaption className="sr-only">{summary}</figcaption>
      <details className="chart-data">
        <summary>Show the numbers</summary>
        <div className="table-wrap">
          <table>
            <caption className="sr-only">{ariaLabel}</caption>
            <thead><tr><th scope="col">Day</th>{series.map((s) => <th key={s.label} scope="col">{s.label}</th>)}</tr></thead>
            <tbody>
              {labels.map((l, i) => (
                <tr key={i}><th scope="row">{l}</th>{series.map((s) => <td key={s.label}>{s.values[i] == null ? "—" : Math.round(s.values[i]! * 10) / 10}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

/**
 * Plain-language description of a chart, for screen readers and the caption.
 * Descriptive only (averages, range, direction) — never an interpretation or assessment.
 */
export function describeSeries(series: Series[], labels: string[], band?: { lo: number; hi: number }) {
  const r1 = (x: number) => Math.round(x * 10) / 10;
  const parts = series.map((s) => {
    const v = s.values.filter((x): x is number => x != null);
    if (!v.length) return `${s.label}: no data`;
    const avg = v.reduce((a, b) => a + b, 0) / v.length;
    const half = Math.floor(v.length / 2);
    const first = v.slice(0, half), second = v.slice(half);
    const m = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const delta = v.length >= 4 ? m(second) - m(first) : 0;
    const dir = Math.abs(delta) < 0.5 ? "fairly steady" : delta > 0 ? "higher in the second half" : "lower in the second half";
    return `${s.label} averaged ${r1(avg)} (range ${r1(Math.min(...v))}–${r1(Math.max(...v))}), latest ${r1(v[v.length - 1])}, ${dir}`;
  });
  const span = labels.length ? `${labels.length} points from ${labels[0]} to ${labels[labels.length - 1]}. ` : "";
  const usual = band ? ` Shaded band: your usual range ${r1(band.lo)}–${r1(band.hi)}.` : "";
  return `${span}${parts.join("; ")}.${usual}`;
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return <div className="legend">{items.map((i) => <span key={i.label}><i style={{ background: i.color }} />{i.label}</span>)}</div>;
}
