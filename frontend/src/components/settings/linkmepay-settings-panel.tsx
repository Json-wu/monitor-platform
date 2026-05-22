"use client";

import { useCallback, useEffect, useState } from "react";
import { CreditCard } from "lucide-react";
import { apiGet, apiPatch } from "@/lib/api";
import { SectionCard } from "@/components/section-card";
import { FormField } from "@/components/ui/form-field";
import { Tips } from "@/components/ui/tips";
import { useShowApiError } from "@/lib/show-api-error";

type LmSettings = {
  enabled: boolean;
  baseUrl: string;
  pid: string;
  secretKeySet: boolean;
  defaultAction: string;
  notifyPublicBase: string;
};

function getPublicApiBase(): string {
  const raw = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000").replace(
    /\/+$/,
    "",
  );
  if (/\/api$/i.test(raw)) return raw;
  return `${raw}/api`;
}

type LinkmePaySettingsPanelProps = {
  appId: string;
  /** dialog：嵌入弹窗时不展示页级标题 */
  variant?: "page" | "dialog";
  onSaved?: () => void;
};

export function LinkmePaySettingsPanel({
  appId,
  variant = "page",
  onSaved,
}: LinkmePaySettingsPanelProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const showApiError = useShowApiError();

  const [enabled, setEnabled] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [pid, setPid] = useState("");
  const [secretKeyNew, setSecretKeyNew] = useState("");
  const [defaultAction, setDefaultAction] = useState("SN20108");
  const [notifyPublicBase, setNotifyPublicBase] = useState("");
  const [secretKeySet, setSecretKeySet] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const lm = await apiGet<LmSettings>(`/apps/${appId}/integrations/linkme-pay`);
      setEnabled(lm.enabled);
      setBaseUrl(lm.baseUrl || "");
      setPid(lm.pid || "");
      setDefaultAction(lm.defaultAction || "SN20108");
      setNotifyPublicBase(lm.notifyPublicBase || "");
      setSecretKeySet(lm.secretKeySet);
      setSecretKeyNew("");
    } catch (e) {
      showApiError(e);
    } finally {
      setLoading(false);
    }
  }, [appId, showApiError]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      const body: Record<string, unknown> = {
        enabled,
        baseUrl: baseUrl.trim(),
        pid: pid.trim(),
        defaultAction: defaultAction.trim(),
        notifyPublicBase: notifyPublicBase.trim(),
      };
      if (secretKeyNew.trim() !== "") {
        body.secretKey = secretKeyNew.trim();
      }
      await apiPatch(`/apps/${appId}/integrations/linkme-pay`, body);
      setSecretKeyNew("");
      setSaved(true);
      await load();
      onSaved?.();
    } catch (err) {
      showApiError(err);
    } finally {
      setSaving(false);
    }
  }

  async function handleClearSecret() {
    if (!confirm("确定清除已保存的 LinkMePay secretKey？")) return;
    setSaving(true);
    try {
      await apiPatch(`/apps/${appId}/integrations/linkme-pay`, { secretKey: "" });
      setSaved(true);
      await load();
      onSaved?.();
    } catch (err) {
      showApiError(err);
    } finally {
      setSaving(false);
    }
  }

  const collectEndpoint = `${getPublicApiBase()}/public/payment/linkmepay/collect?slug=xxx`;

  if (loading) {
    return <div className="text-sm text-muted-foreground">加载中…</div>;
  }

  return (
    <div className="space-y-6">
      {variant === "page" ? (
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">LinkMePay</h2>
          <Tips className="mt-2">
            代收（Collect）对接：pid、密钥与异步通知公网根地址；官网通过 Monitor 代理创建订单，密钥不暴露到浏览器。
          </Tips>
        </div>
      ) : null}

      {saved ? (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          已保存。
        </div>
      ) : null}

      <SectionCard
        title="商户凭证"
        tips="与 LinkMePay 商户后台一致；action 对应支付渠道（如 SN20108 PayPal、SN20107 BTC）。"
      >
        <form onSubmit={handleSave} className="max-w-xl space-y-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="rounded border-border"
            />
            启用 LinkMePay 代收
          </label>
          <FormField label="API 根地址" hint="默认 https://api.linkmepay.com">
            <input
              className="input w-full font-mono text-xs"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.linkmepay.com"
              autoComplete="off"
            />
          </FormField>
          <FormField label="商户 ID（pid）">
            <input
              className="input w-full font-mono text-xs"
              value={pid}
              onChange={(e) => setPid(e.target.value)}
              autoComplete="off"
            />
          </FormField>
          <FormField
            label="密钥（secretKey）"
            hint={
              secretKeySet
                ? "已保存密钥。填写新值将覆盖；留空则不改。"
                : "用于请求签名与异步通知验签。"
            }
          >
            <input
              className="input w-full font-mono text-xs"
              type="password"
              value={secretKeyNew}
              onChange={(e) => setSecretKeyNew(e.target.value)}
              autoComplete="new-password"
              placeholder={secretKeySet ? "（留空则保持原密钥）" : ""}
            />
          </FormField>
          {secretKeySet ? (
            <button
              type="button"
              className="text-xs text-muted-foreground underline hover:text-foreground"
              onClick={handleClearSecret}
              disabled={saving}
            >
              清除已保存的 secretKey
            </button>
          ) : null}
          <FormField label="默认 action" hint="例如 SN20108（PayPal）、SN201010（信用卡）">
            <input
              className="input w-full font-mono text-xs"
              value={defaultAction}
              onChange={(e) => setDefaultAction(e.target.value)}
              autoComplete="off"
            />
          </FormField>
          <FormField
            label="异步通知公网根地址（notifyPublicBase）"
            hint="Monitor 对外可访问的根 URL（无尾斜杠），用于拼接 /api/payment/webhooks/linkmepay。本地需 ngrok 等。"
          >
            <input
              className="input w-full font-mono text-xs"
              value={notifyPublicBase}
              onChange={(e) => setNotifyPublicBase(e.target.value)}
              placeholder="https://monitor.example.com"
              autoComplete="off"
            />
          </FormField>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "保存中…" : "保存"}
          </button>
        </form>
      </SectionCard>

      <SectionCard
        title="公开代收接口"
        tips="官网应调用下方地址创建代收订单；需 Header X-App-Key、Query slug（真实值见应用列表或环境变量，此处 xxx 占位）。JSON Body 仅含三项：planId（定价方案 UUID）、payerId（终端用户 UUID）、quantity（订阅类须为 1，按量包为购买份数）。"
      >
        <div className="space-y-3 text-sm">
          <div className="flex items-start gap-2 rounded-lg bg-muted/40 px-3 py-2 font-mono text-xs break-all">
            <CreditCard className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <div className="text-muted-foreground">POST 方法</div>
              <div>{collectEndpoint}</div>
            </div>
          </div>
          <FormField label="应用标识（slug）" hint="请在应用列表或环境变量中查看真实 slug">
            <input className="input w-full max-w-md font-mono text-xs" readOnly value="xxx" />
          </FormField>
          <FormField label="应用密钥（X-App-Key）" hint="请在应用列表复制 APP Key，勿在集成页拉取完整应用信息">
            <input className="input w-full max-w-md font-mono text-xs" readOnly value="xxx" />
          </FormField>
        </div>
      </SectionCard>
    </div>
  );
}
