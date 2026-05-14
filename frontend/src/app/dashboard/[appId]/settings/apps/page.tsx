"use client";

import { useParams } from "next/navigation";
import { AppsSettingsPanel } from "@/components/settings/apps-panel";
import { SystemSettingsGuard } from "@/components/system-settings-guard";

export default function SettingsAppsPage() {
  const params = useParams<{ appId: string }>();
  const appId = params.appId;

  return (
    <SystemSettingsGuard appId={appId}>
      <AppsSettingsPanel />
    </SystemSettingsGuard>
  );
}
