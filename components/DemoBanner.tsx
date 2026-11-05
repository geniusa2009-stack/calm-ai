import Link from "next/link";
export function DemoBanner() {
  return (
    <div className="demo-banner" role="note">
      <span>You&apos;re in a <strong>temporary demo account</strong> with a made-up person&apos;s six weeks. It&apos;s separate from any real account and is deleted automatically.</span>
      <Link href="/settings#account">Create a real account →</Link>
    </div>
  );
}
