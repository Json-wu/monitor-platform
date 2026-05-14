"use client";

import { useCallback, useEffect, useState } from "react";
import { Plug } from "lucide-react";
import { apiGet, apiPatch } from "@/lib/api";
import { SectionCard } from "@/components/section-card";
import { FormField } from "@/components/ui/form-field";

type RbSettings = {
  url: string;
  authUser: string;
  authPassSet: boolean;
  enabled: boolean;
};

function getPublicApiBase(): string {
  const raw = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000").replace(
    /\/+$/,
    "",
  );
  if (/\/api$/i.test(raw)) return raw;
  return `${raw}/api`;
}

type RemoveBgApiPanelProps = {
  appId: string;
  variant?: "page" | "dialog";
  onSaved?: () => void;
};

export function RemoveBgApiPanel({
  appId,
  variant = "page",
  onSaved,
}: RemoveBgApiPanelProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const [url, setUrl] = useState("");
  const [authUser, setAuthUser] = useState("");
  const [authPassNew, setAuthPassNew] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [authPassSet, setAuthPassSet] = useState(false);

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const rb = await apiGet<RbSettings>(`/apps/${appId}/clearbg-settings`);
      setUrl(rb.url || "");
      setAuthUser(rb.authUser || "");
      setEnabled(rb.enabled);
      setAuthPassSet(rb.authPassSet);
      setAuthPassNew("");
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
      const body: Record<string, unknown> = {
        url: url.trim(),
        authUser: authUser.trim(),
        enabled,
      };
      if (authPassNew.trim() !== "") {
        body.authPass = authPassNew.trim();
      }
      await apiPatch(`/apps/${appId}/clearbg-settings`, body);
      setAuthPassNew("");
      setSaved(true);
      await load();
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function handleClearPassword() {
    if (!confirm("确定清除已保存的第三方 API 密码？")) return;
    setSaving(true);
    setError("");
    try {
      await apiPatch(`/apps/${appId}/clearbg-settings`, { authPass: "" });
      setSaved(true);
      await load();
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setSaving(false);
    }
  }

  const endpoint = `${getPublicApiBase()}/v1/clearbg`;

  if (loading) {
    return (
      <div className="text-sm text-muted-foreground">加载中…</div>
    );
  }

  return (
    <div className="space-y-6">
      {variant === "page" ? (
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">抠图 API</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            配置第三方抠图服务（如 Pixian）的地址与 Basic Auth；官网前端通过 Monitor 代理调用，不暴露密钥。
          </p>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}
      {saved ? (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          已保存。
        </div>
      ) : null}

      <SectionCard
        title="上游服务"
        description="与 Pixian 示例一致：POST multipart，字段名为 image；可选 HTTP Basic 认证。"
      >
        <form onSubmit={handleSave} className="max-w-xl space-y-4">
          <FormField label="API 地址" hint="例如 https://api.pixian.ai/api/v2/remove-background">
            <input
              className="input w-full"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
              autoComplete="off"
            />
          </FormField>
          <FormField label="Basic 认证 — 用户名">
            <input
              className="input w-full"
              value={authUser}
              onChange={(e) => setAuthUser(e.target.value)}
              autoComplete="off"
            />
          </FormField>
          <FormField
            label="Basic 认证 — 密码"
            hint={
              authPassSet
                ? "已保存密码。填写新值将覆盖；留空则不改。可点击下方清除。"
                : "可选，与上游要求一致时填写。"
            }
          >
            <input
              className="input w-full"
              type="password"
              value={authPassNew}
              onChange={(e) => setAuthPassNew(e.target.value)}
              autoComplete="new-password"
              placeholder={authPassSet ? "（留空则保持原密码）" : ""}
            />
          </FormField>
          {authPassSet ? (
            <button
              type="button"
              className="text-xs text-muted-foreground underline hover:text-foreground"
              onClick={handleClearPassword}
              disabled={saving}
            >
              清除已保存的密码
            </button>
          ) : null}
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="rounded border-border"
            />
            启用公开代理（关闭时 POST /v1/clearbg 将不可用）
          </label>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "保存中…" : "保存"}
          </button>
        </form>
      </SectionCard>

      <SectionCard
        title="前端对接"
        description="公开抠图接口为 POST /api/v1/clearbg（应用 slug 为 clearbg）。计费用户须在请求头携带终端用户 UUID：`X-User-Id`（与可灵生图公开接口一致）；其它需应用鉴权的接口仍使用应用级 X-App-Key。"
      >
        <div className="space-y-3 text-sm">
          <div className="flex items-start gap-2 rounded-lg bg-muted/40 px-3 py-2 font-mono text-xs break-all">
            <Plug className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <div className="text-muted-foreground">POST 方法</div>
              <div>{endpoint}</div>
            </div>
          </div>
          <FormField label="应用标识 slug（参考）" hint="真实 slug 见应用列表或路由中的应用上下文">
            <input className="input w-full max-w-md font-mono text-xs" readOnly value="xxx" />
          </FormField>
          <p className="text-xs text-muted-foreground leading-relaxed">
            应用 API Key（轮换见 Applications）仍用于其它需应用鉴权的接口；抠图公开 API 计费使用终端用户{" "}
            <span className="font-mono text-foreground">X-User-Id</span>。
          </p>
        </div>
      </SectionCard>
    </div>
  );
}
