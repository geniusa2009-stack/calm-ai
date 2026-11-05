import { getSettings } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { companionConfigured } from "@/lib/companion";
import { SettingsClient } from "./SettingsClient";
import { SignalsClient } from "./SignalsClient";
import { PROVIDERS } from "@/lib/signals/providers";
import { connections } from "@/lib/signals/store";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  return (
    <div className="stack" style={{ maxWidth: 720 }}>
      <div className="head"><h1>Settings</h1></div>
      <SettingsClient settings={getSettings(user.id)} configured={companionConfigured()} isDemo={user.isDemo} email={user.email} />
      <SignalsClient providers={PROVIDERS.map(({ id, name, status, description }) => ({ id, name, status, description }))} conns={connections(user.id)} isDemo={user.isDemo} />
    </div>
  );
}
