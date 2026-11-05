import Link from "next/link";
import { EmptyState } from "@/components/ui";
export default function NotFound() {
  return <EmptyState icon="?" title="Nothing here" action={<Link href="/" className="btn ghost">Back to Today</Link>}>That page doesn&apos;t exist, or it may have moved.</EmptyState>;
}
