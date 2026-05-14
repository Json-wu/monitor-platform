"use client";

import { useParams } from "next/navigation";
import { AdminsSettingsPanel } from "@/components/settings/admins-panel";
import { SystemSettingsGuard } from "@/components/system-settings-guard";

export default function SettingsAdminsPage() {
  const params = useParams<{ appId: string }>();
  const appId = params.appId;

  return (
    <SystemSettingsGuard appId={appId}>
      <AdminsSettingsPanel />
    </SystemSettingsGuard>
  );
}
