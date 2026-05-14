"use client";

import { useParams } from "next/navigation";
import { RolesSettingsPanel } from "@/components/settings/roles-panel";
import { SystemSettingsGuard } from "@/components/system-settings-guard";

export default function SettingsRolesPage() {
  const params = useParams<{ appId: string }>();
  const appId = params.appId;

  return (
    <SystemSettingsGuard appId={appId}>
      <RolesSettingsPanel />
    </SystemSettingsGuard>
  );
}
