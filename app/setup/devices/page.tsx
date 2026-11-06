import { getSettings } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { DeviceSetupFlow } from "./DeviceSetup";

export const dynamic = "force-dynamic";
export const metadata = { title: "Optional setup" };

export default async function DeviceSetupPage({ searchParams }: { searchParams: Promise<{ restart?: string }> }) {
  const user = await requireUser();
  const s = getSettings(user.id);
  const restart = (await searchParams).restart === "1";
  // Resume where the person left off, unless they finished/skipped or asked to start over.
  const step = restart || s.deviceSetup === "done" || s.deviceSetup === "skipped" ? 0 : s.deviceStep;
  return (
    <div style={{ maxWidth: 620, margin: "0 auto" }}>
      <DeviceSetupFlow initialStep={step} prefs={{ notifyEnabled: s.notifyEnabled, wakeLockEnabled: s.wakeLockEnabled, hapticsEnabled: s.hapticsEnabled }} />
    </div>
  );
}
