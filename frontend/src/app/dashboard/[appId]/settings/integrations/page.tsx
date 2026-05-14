"use client";

import { useParams } from "next/navigation";
import { IntegrationsSettingsList } from "@/components/settings/integrations-settings-list";
import { SystemSettingsGuard } from "@/components/system-settings-guard";

export default function SettingsIntegrationsPage() {
  const params = useParams<{ appId: string }>();
  const appId = params.appId;

  return (
    <SystemSettingsGuard appId={appId}>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">集成</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            以下配置为<strong className="text-foreground">全站共用一套</strong>（支付、SMTP、抠图上游）；密钥仅保存在服务端。从任一应用的「集成」页进入修改效果相同。
          </p>
        </div>

        <IntegrationsSettingsList appId={appId} />
      </div>
    </SystemSettingsGuard>
  );
}
