import Link from "next/link";
import { PageHeader, EmptyState } from "@/components/ui";
import { getSettings, listCompanion } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { companionConfigured } from "@/lib/companion";
import { Chat } from "./Chat";

export const dynamic = "force-dynamic";

export default async function CompanionPage() {
  const user = await requireUser();
  const s = getSettings(user.id);
  if (!s.companionEnabled) {
    return (
      <div className="stack" style={{ maxWidth: 680 }}>
        <PageHeader eyebrow="People" title={<>Companion</>} lead=<>The companion is turned off. Calm works fully without it.</> />
        <Link href="/settings" className="btn ghost">Turn it on in Settings</Link>
      </div>
    );
  }
  return (
    <div className="stack" style={{ maxWidth: 760 }}>
      <PageHeader eyebrow="People" title={<>Companion</>} lead=<>An optional space to talk things through. {s.companionUsesContext ? "It can see a short summary of your patterns and pinned memories so it can be specific to you." : "You've chosen not to share your patterns with it."} <Link href="/settings">Change</Link></> />
      <Chat initial={listCompanion(user.id, 40).map((m) => ({ role: m.role, content: m.content }))} configured={companionConfigured()} />
    </div>
  );
}
