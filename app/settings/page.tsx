import { getSettings } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { companionConfigured } from "@/lib/companion";
import { SettingsClient } from "./SettingsClient";
import { SignalsClient } from "./SignalsClient";
import { DevicePermissions } from "./DevicePermissions";
import { PageHeader } from "@/components/ui";
import { PROVIDERS } from "@/lib/signals/providers";
import { connections } from "@/lib/signals/store";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  const settings = getSettings(user.id);
  return (
    <div className="stack lg" style={{ maxWidth: 760 }}>
      <PageHeader eyebrow="Settings" title="Your preferences" lead="How Calm works for you, what it can use on this device, and what happens to your data." />
      <nav aria-label="Settings sections" className="row settings-toc">
        {[["mode", "Mode"], ["nudges", "Nudges"], ["device", "Device & permissions"], ["companion", "Companion"], ["signals", "Connected data"], ["data", "Your data"], ["account", "Account"]].map(([id, l]) => (
          <a key={id} href={`#${id}`} className="chip">{l}</a>
        ))}
      </nav>
      <SettingsClient
        settings={settings} configured={companionConfigured()} isDemo={user.isDemo} email={user.email}
        deviceSlot={<DevicePermissions prefs={{ notifyEnabled: settings.notifyEnabled, wakeLockEnabled: settings.wakeLockEnabled, hapticsEnabled: settings.hapticsEnabled, deviceSetup: settings.deviceSetup }} />}
        signalsSlot={<SignalsClient providers={PROVIDERS.map(({ id, name, status, description }) => ({ id, name, status, description }))} conns={connections(user.id)} isDemo={user.isDemo} />}
      />
    </div>
  );
}
