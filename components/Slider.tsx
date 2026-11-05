"use client";
export function Slider({ label, value, onChange, min = 1, max = 10, step = 1, lo, hi, unit = "" }: {
  label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; lo: string; hi: string; unit?: string;
}) {
  const id = `s-${label.replace(/\W/g, "")}`;
  return (
    <div className="slider">
      <div className="slider-top"><label htmlFor={id}><strong>{label}</strong></label><span className="slider-val" aria-hidden>{value}{unit}</span></div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-valuetext={`${value}${unit}`} />
      <div className="slider-ends" aria-hidden><span>{lo}</span><span>{hi}</span></div>
    </div>
  );
}
