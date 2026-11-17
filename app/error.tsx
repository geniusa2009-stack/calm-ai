"use client";
import Link from "next/link";
import { EmptyState } from "@/components/ui";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <EmptyState icon="!" title="Something didn't load"
      action={<div className="row" style={{ justifyContent: "center" }}><button className="btn" onClick={reset}>Try again</button><Link href="/" className="btn ghost">Back to Today</Link></div>}>
      Your data is safe. This is usually temporary — try again in a moment. If you need support right now, the Circle &amp; help page lists people you can reach.
    </EmptyState>
  );
}
