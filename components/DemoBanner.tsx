import Link from "next/link";
export function DemoBanner() {
  return (
    <div className="demo-banner" role="note">
      <span>You&apos;re exploring with <strong>demo data</strong> — a made-up person&apos;s six weeks.</span>
      <Link href="/settings#data">Start with your own data →</Link>
    </div>
  );
}
