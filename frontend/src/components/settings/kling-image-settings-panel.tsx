"use client";

import { useCallback, useEffect, useState } from "react";
import { Plug } from "lucide-react";
import { apiGet, apiPatch } from "@/lib/api";
import { SectionCard } from "@/components/section-card";
import { FormField } from "@/components/ui/form-field";
import { Tips } from "@/components/ui/tips";
import { useShowApiError } from "@/lib/show-api-error";

const MODEL_SINGLE_OPTIONS = [
  { value: "kling-v1-5", label: "kling-v1-5（支持单张参考图）" },
  { value: "kling-v2", label: "kling-v2" },
  { value: "kling-v2-new", label: "kling-v2-new" },
  { value: "kling-v1", label: "kling-v1" },
] as const;

const MODEL_MULTI_OPTIONS = [
  { value: "kling-v2", label: "kling-v2" },
  { value: "kling-v2-1", label: "kling-v2-1" },
] as const;

type KlingSettings = {
  enabled: boolean;
  apiKeySet: boolean;
  accessKeySet: boolean;
  secretKeySet: boolean;
  defaultModelSingle: string;
  defaultModelMulti: string;
  defaultRoomDecorationModel: string;
  baseUrl: string;
};


function getPublicApiBase(): string {
  const raw = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000").replace(
    /\/+$/,
    "",
  );
  if (/\/api$/i.test(raw)) return raw;
  return `${raw}/api`;
}

type KlingImageSettingsPanelProps = {
  appId: string;
  variant?: "page" | "dialog";
  onSaved?: () => void;
};

function pickModel(
  value: string,
  options: readonly { value: string; label: string }[],
  fallback: string,
): string {
  return options.some((o) => o.value === value) ? value : fallback;
}

export function KlingImageSettingsPanel({
  appId,
  variant = "page",
  onSaved,
}: KlingImageSettingsPanelProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const showApiError = useShowApiError();

  const [enabled, setEnabled] = useState(false);
  const [accessKeyNew, setAccessKeyNew] = useState("");
  const [secretKeyNew, setSecretKeyNew] = useState("");
  const [accessKeySet, setAccessKeySet] = useState(false);
  const [secretKeySet, setSecretKeySet] = useState(false);
  const [defaultModelSingle, setDefaultModelSingle] = useState<string>(MODEL_SINGLE_OPTIONS[0].value);
  const [defaultModelMulti, setDefaultModelMulti] = useState<string>(MODEL_MULTI_OPTIONS[0].value);
  const [defaultRoomDecorationModel, setDefaultRoomDecorationModel] = useState<string>("");
  const [baseUrl, setBaseUrl] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const kling = await apiGet<KlingSettings>(`/apps/${appId}/integrations/kling-image`);
      setEnabled(kling.enabled);
      setAccessKeySet(kling.accessKeySet);
      setSecretKeySet(kling.secretKeySet);
      setDefaultModelSingle(
        pickModel(kling.defaultModelSingle, MODEL_SINGLE_OPTIONS, MODEL_SINGLE_OPTIONS[0].value),
      );
      setDefaultModelMulti(
        pickModel(kling.defaultModelMulti, MODEL_MULTI_OPTIONS, MODEL_MULTI_OPTIONS[0].value),
      );
      setDefaultRoomDecorationModel((kling.defaultRoomDecorationModel ?? "").trim());
      setBaseUrl(kling.baseUrl || "");
      setAccessKeyNew("");
      setSecretKeyNew("");
    } catch (e) {
      showApiError(e);
    } finally {
      setLoading(false);
    }
  }, [appId, showApiError]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      const body: Record<string, unknown> = {
        enabled,
        defaultModelSingle,
        defaultModelMulti,
        defaultRoomDecorationModel: defaultRoomDecorationModel.trim(),
        baseUrl: baseUrl.trim(),
      };
      if (accessKeyNew.trim() !== "") {
        body.accessKey = accessKeyNew.trim();
      }
      if (secretKeyNew.trim() !== "") {
        body.secretKey = secretKeyNew.trim();
      }
      await apiPatch(`/apps/${appId}/integrations/kling-image`, body);
      setAccessKeyNew("");
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

  async function handleClearCredentials() {
    if (!confirm("确定清空已保存的 AccessKey 与 SecretKey？")) return;
    setSaving(true);
    try {
      await apiPatch(`/apps/${appId}/integrations/kling-image`, { accessKey: "", secretKey: "" });
      setSaved(true);
      await load();
      onSaved?.();
    } catch (err) {
      showApiError(err);
    } finally {
      setSaving(false);
    }
  }

  const base = getPublicApiBase();
  const genUrl = `${base}/public/image-generation/generate`;
  const turingUrl = `${base}/public/image-generation/turing`;
  const roomDecoUrl = `${base}/v1/room-decoration/generate`;

  if (loading) {
    return <div className="text-sm text-muted-foreground">加载中…</div>;
  }

  const credReady = accessKeySet && secretKeySet;

  return (
    <div className="space-y-6">
      {variant === "page" ? (
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">可灵生图</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            全站共用可灵开放平台 HTTP API；后台保存 AccessKey / SecretKey，服务端按文档生成 JWT 调上游，不在浏览器暴露密钥。
          </p>
        </div>
      ) : null}

      {saved ? (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          已保存。
        </div>
      ) : null}

      <SectionCard
        title="可灵开放平台"
        tips="鉴权见官方 document-api 通用说明：使用 AccessKey、SecretKey 签发短期 Bearer Token（HS256）。默认 API 域名为新加坡接入点，可按控制台说明改为其他区域根地址。"
      >
        <form onSubmit={handleSave} className="max-w-xl space-y-4">
          <FormField
            label="AccessKey"
            hint={accessKeySet ? "已保存。填写新值覆盖；留空不改。" : "与 SecretKey 成对必填后方可启用生图。"}
          >
            <input
              className="input w-full font-mono text-xs"
              type="password"
              value={accessKeyNew}
              onChange={(e) => setAccessKeyNew(e.target.value)}
              autoComplete="off"
              placeholder={accessKeySet ? "（留空则保持）" : ""}
            />
          </FormField>
          <FormField
            label="SecretKey"
            hint={secretKeySet ? "已保存。填写新值覆盖；留空不改。" : ""}
          >
            <input
              className="input w-full font-mono text-xs"
              type="password"
              value={secretKeyNew}
              onChange={(e) => setSecretKeyNew(e.target.value)}
              autoComplete="new-password"
              placeholder={secretKeySet ? "（留空则保持）" : ""}
            />
          </FormField>
          {credReady ? (
            <button
              type="button"
              className="text-xs text-muted-foreground underline hover:text-foreground"
              onClick={handleClearCredentials}
              disabled={saving}
            >
              清空已保存的 AccessKey / SecretKey
            </button>
          ) : null}
          <FormField
            label="API 根地址"
            hint="默认 https://api-singapore.klingai.com（无尾斜杠）"
          >
            <input
              className="input w-full font-mono text-xs"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api-singapore.klingai.com"
              autoComplete="off"
            />
          </FormField>
          <FormField
            label="默认 model_name（0–1 张参考图）"
            hint="对应官方 POST /v1/images/generations"
          >
            <select
              className="input w-full"
              value={defaultModelSingle}
              onChange={(e) => setDefaultModelSingle(e.target.value)}
            >
              {MODEL_SINGLE_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField
            label="默认 model_name（2–4 张参考图）"
            hint="对应官方 POST /v1/images/multi-image2image"
          >
            <select
              className="input w-full"
              value={defaultModelMulti}
              onChange={(e) => setDefaultModelMulti(e.target.value)}
            >
              {MODEL_MULTI_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField
            label="房间装修图默认 model_name"
            hint="POST /api/v1/room-decoration/generate 未传 roomDecorationModelId 时使用。留空则与上方「0–1 张参考图」默认相同；须为可灵单图接口支持的 model_name"
          >
            <input
              className="input w-full font-mono text-xs"
              value={defaultRoomDecorationModel}
              onChange={(e) => setDefaultRoomDecorationModel(e.target.value)}
              placeholder="例如 kling-v2（留空则继承单图默认）"
              autoComplete="off"
            />
          </FormField>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="rounded border-border"
            />
            启用公开生图代理（关闭时公开接口将返回不可用）
          </label>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "保存中…" : "保存"}
          </button>
        </form>
      </SectionCard>

      <SectionCard
        title="公开接口（应用鉴权 + 积分）"
        tips="Query `slug` + Header `X-App-Key`（应用）。可选 `X-User-Id`（终端用户 UUID，与抠图 `/api/v1/clearbg` 相同）：识别到用户则每次生图扣 1 积分，余额不足不调用可灵；失败退回。未带时与抠图共用匿名日限：同一应用、同一 IP 每 UTC 日共 1 次免费。`sync:false` 时 taskId 含 gen:/mi2i: 前缀。"
      >
        <div className="space-y-3 text-sm">
          <div className="flex items-start gap-2 rounded-lg bg-muted/40 px-3 py-2 font-mono text-xs break-all">
            <Plug className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <div className="text-muted-foreground">简化 JSON</div>
              <div>{genUrl}?slug=xxx</div>
            </div>
          </div>
          <div className="flex items-start gap-2 rounded-lg bg-muted/40 px-3 py-2 font-mono text-xs break-all">
            <Plug className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <div className="text-muted-foreground">图灵兼容（perception + inputImage）</div>
              <div>{turingUrl}?slug=xxx</div>
            </div>
          </div>
          <div className="flex items-start gap-2 rounded-lg bg-muted/40 px-3 py-2 font-mono text-xs break-all">
            <Plug className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <div className="text-muted-foreground">
                房间装修图（X-App-Key）：POST 仅创建任务；用 GET {base}/v1/room-decoration/tasks/{"{taskId}"} 轮询进度
              </div>
              <div>{roomDecoUrl}</div>
            </div>
          </div>
          <FormField label="应用 slug（参考）" hint="真实 slug 见应用列表或路由中的应用上下文">
            <input className="input w-full max-w-md font-mono text-xs" readOnly value="xxx" />
          </FormField>
          <Tips>
            官方文档：{" "}
            <a
              className="text-primary underline"
              href="https://klingai.com/document-api/apiReference/commonInfo"
              target="_blank"
              rel="noreferrer"
            >
              klingai.com/document-api
            </a>
            。
          </Tips>
        </div>
      </SectionCard>
    </div>
  );
}
