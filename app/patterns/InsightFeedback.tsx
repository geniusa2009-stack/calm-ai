"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";

export function InsightFeedback({ k, current }: { k: string; current: number }) {
  const router = useRouter();
  const [v, setV] = useState(current);
  async function rate(r: number) {
    setV(r);
    await api("/api/insights", "POST", { key: k, rating: r });
    router.refresh();
  }
  return (
    <div className="row" style={{ gap: 6 }}>
      <span className="faint">Does this fit?</span>
      <button className={`chip ${v === 1 ? "on" : ""}`} onClick={() => rate(1)} aria-pressed={v === 1}>Yes</button>
      <button className="chip" onClick={() => rate(-1)}>Not really — hide</button>
    </div>
  );
}
