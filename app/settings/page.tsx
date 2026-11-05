import { getSettings, listCheckIns } from "@/lib/db";
import { companionConfigured } from "@/lib/companion";
import { SettingsClient } from "./SettingsClient";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <div className="stack" style={{ maxWidth: 720 }}>
      <div className="head"><h1>Settings</h1></div>
      <SettingsClient settings={getSettings()} configured={companionConfigured()} hasDemo={listCheckIns(365).some((c) => c.source === "demo")} />
    </div>
  );
}
