import Link from "next/link";
export default function NotFound() {
  return <div className="stack"><h1>Not here</h1><p className="muted">That page doesn&apos;t exist.</p><Link href="/" className="btn ghost">Back to today</Link></div>;
}
