"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPatch } from "@/lib/api";
import { SectionCard } from "@/components/section-card";
import { FormField } from "@/components/ui/form-field";

type GumroadSettings = {
  enabled: boolean;
  sellerId: string;
  sellerIdSet: boolean;
};

function getPublicApiBase(): string {
  const raw = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000").replace(
    /\/+$/,
    "",
  );
  if (/\/api$/i.test(raw)) return raw;
  return `${raw}/api`;
}

type GumroadSettingsPanelProps = {
  appId: string;
  variant?: "page" | "dialog";
  onSaved?: () => void;
};

export function GumroadSettingsPanel({
  appId,
  variant = "page",
  onSaved,
}: GumroadSettingsPanelProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const [enabled, setEnabled] = useState(true);
  const [sellerId, setSellerId] = useState("");

  const pingUrl = `${getPublicApiBase()}/payment/webhooks/gumroad`;

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const g = await apiGet<GumroadSettings>(`/apps/${appId}/integrations/gumroad`);
      setEnabled(g.enabled);
      setSellerId(g.sellerId || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [appId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await apiPatch(`/apps/${appId}/integrations/gumroad`, {
        enabled,
        sellerId: sellerId.trim(),
      });
      setSaved(true);
      await load();
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  const form = (
    <form onSubmit={handleSave} className="space-y-4">
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {saved ? <p className="text-sm text-emerald-500">已保存</p> : null}

      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="rounded border-border"
        />
        启用 Gumroad Ping / Webhook
      </label>

      <FormField
        label="Seller ID"
        hint="Gumroad 卖家 ID，须与 Ping 请求体中的 seller_id 完全一致（可在 Gumroad 产品页 URL 或测试 Ping 里查看）"
      >
        <input
          className="input font-mono text-sm"
          value={sellerId}
          onChange={(e) => setSellerId(e.target.value)}
          placeholder="例如 Gumroad 账号下的 seller_id"
          required
        />
      </FormField>

      <FormField label="Ping 回调地址" hint="填到 Gumroad → Settings → Advanced → Ping endpoint">
        <input className="input font-mono text-sm" readOnly value={pingUrl} />
      </FormField>

      <p className="text-xs text-muted-foreground">
        定价方案的「支付链接」须与 Gumroad 产品 URL 一致，Webhook 才能匹配方案并按买家邮箱发放积分。
      </p>

      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary" disabled={saving || loading}>
          {saving ? "保存中…" : "保存"}
        </button>
      </div>
    </form>
  );

  if (variant === "dialog") {
    return loading ? <p className="text-sm text-muted-foreground">加载中…</p> : form;
  }

  return (
    <SectionCard
      title="Gumroad"
      description="全站共用；配置 seller_id 后 Ping 回调方可验签并发放积分。"
    >
      {loading ? <p className="text-sm text-muted-foreground">加载中…</p> : form}
    </SectionCard>
  );
}
