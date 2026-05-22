"use client";

import { useCallback, useEffect, useState } from "react";
import { Plug } from "lucide-react";
import { apiGet, apiPatch } from "@/lib/api";
import { SectionCard } from "@/components/section-card";
import { FormField } from "@/components/ui/form-field";
import { Tips } from "@/components/ui/tips";
import { useShowApiError } from "@/lib/show-api-error";

type UpscaleSettings = {
  enabled: boolean;
  apiTokenSet: boolean;
  codeformerRef: string;
  realEsrganRef: string;
  animeUpscalerRef: string;
  lamaInpaintRef: string;
  proHeadshotRef: string;
  ddcolorVersion: string;
  ddcolorVersionIsDefault: boolean;
  ddcolorDefaultModelSize: "large" | "tiny";
  blipRef: string;
  defaultType: "auto" | "face" | "general" | "anime";
};

function getPublicApiBase(): string {
  const raw = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000").replace(
    /\/+$/,
    "",
  );
  if (/\/api$/i.test(raw)) return raw;
  return `${raw}/api`;
}

type UpscaleSettingsPanelProps = {
  appId: string;
  variant?: "page" | "dialog";
  onSaved?: () => void;
};

export function UpscaleSettingsPanel({
  appId,
  variant = "page",
  onSaved,
}: UpscaleSettingsPanelProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const showApiError = useShowApiError();

  const [enabled, setEnabled] = useState(false);
  const [apiTokenNew, setApiTokenNew] = useState("");
  const [apiTokenSet, setApiTokenSet] = useState(false);
  const [defaultType, setDefaultType] = useState<"auto" | "face" | "general" | "anime">("auto");

  const [codeformerRef, setCodeformerRef] = useState("sczhou/codeformer");
  const [realEsrganRef, setRealEsrganRef] = useState("philz1337x/clarity-upscaler");
  const [animeUpscalerRef, setAnimeUpscalerRef] = useState("psychic-canvas/anime-upscaler");
  const [lamaInpaintRef, setLamaInpaintRef] = useState("zylim0702/remove-object");
  const [proHeadshotRef, setProHeadshotRef] = useState("flux-kontext-apps/professional-headshot");
  const [blipRef, setBlipRef] = useState(
    "salesforce/blip:2e1dddc8621f72155f24cf2e0adbde548458d3cab9f00c0139eea840d0ac4746",
  );
  const [ddEnabled, setDdEnabled] = useState(false);
  const [ddApiTokenNew, setDdApiTokenNew] = useState("");
  const [ddApiTokenSet, setDdApiTokenSet] = useState(false);
  const [ddVersion, setDdVersion] = useState("");
  const [ddVersionIsDefault, setDdVersionIsDefault] = useState(true);
  const [ddDefaultModelSize, setDdDefaultModelSize] = useState<"large" | "tiny">("large");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const u = await apiGet<UpscaleSettings>(`/apps/${appId}/integrations/replicate`);
      setEnabled(u.enabled);
      setApiTokenSet(u.apiTokenSet);
      setDefaultType(u.defaultType);
      setCodeformerRef(u.codeformerRef);
      setRealEsrganRef(u.realEsrganRef);
      setAnimeUpscalerRef(u.animeUpscalerRef);
      setLamaInpaintRef(u.lamaInpaintRef ?? "zylim0702/remove-object");
      setProHeadshotRef(u.proHeadshotRef ?? "flux-kontext-apps/professional-headshot");
      setBlipRef(u.blipRef);
      setDdEnabled(u.enabled);
      setDdApiTokenSet(u.apiTokenSet);
      setDdVersion(u.ddcolorVersion);
      setDdVersionIsDefault(u.ddcolorVersionIsDefault);
      setDdDefaultModelSize(u.ddcolorDefaultModelSize);
      setApiTokenNew("");
      setDdApiTokenNew("");
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
      const body: Record<string, unknown> = { enabled, defaultType };
      if (apiTokenNew.trim() !== "") body.apiToken = apiTokenNew.trim();
      await apiPatch(`/apps/${appId}/integrations/replicate`, body);
      setApiTokenNew("");
      setSaved(true);
      await load();
      onSaved?.();
    } catch (err) {
      showApiError(err);
    } finally {
      setSaving(false);
    }
  }

  async function handleClearToken() {
    if (!confirm("确定清空已保存的 API Token？")) return;
    setSaving(true);
    try {
      await apiPatch(`/apps/${appId}/integrations/replicate`, { apiToken: "" });
      setSaved(true);
      await load();
      onSaved?.();
    } catch (err) {
      showApiError(err);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveDdcolor(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      const body: Record<string, unknown> = {
        enabled: ddEnabled,
        ddcolorDefaultModelSize: ddDefaultModelSize,
        ddcolorVersion: ddVersion.trim(),
      };
      if (ddApiTokenNew.trim() !== "") {
        body.apiToken = ddApiTokenNew.trim();
      }
      await apiPatch(`/apps/${appId}/integrations/replicate`, body);
      setDdApiTokenNew("");
      setSaved(true);
      await load();
      onSaved?.();
    } catch (err) {
      showApiError(err);
    } finally {
      setSaving(false);
    }
  }

  async function handleClearDdToken() {
    if (!confirm("确定清空已保存的 DDColor API Token？")) return;
    setSaving(true);
    try {
      await apiPatch(`/apps/${appId}/integrations/replicate`, { apiToken: "" });
      setSaved(true);
      await load();
      onSaved?.();
    } catch (err) {
      showApiError(err);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveModels(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      await apiPatch(`/apps/${appId}/integrations/replicate`, {
        codeformerRef: codeformerRef.trim(),
        realEsrganRef: realEsrganRef.trim(),
        animeUpscalerRef: animeUpscalerRef.trim(),
        lamaInpaintRef: lamaInpaintRef.trim(),
        proHeadshotRef: proHeadshotRef.trim(),
        blipRef: blipRef.trim(),
      });
      setSaved(true);
      await load();
    } catch (err) {
      showApiError(err);
    } finally {
      setSaving(false);
    }
  }

  const onblurUrl = `${getPublicApiBase()}/v1/unblur`;
  const inpaintingUrl = `${getPublicApiBase()}/v1/inpainting`;
  const proHeadshotUrl = `${getPublicApiBase()}/v1/pro-headshot`;
  const colorizeUrl = `${getPublicApiBase()}/v1/colorize`;

  if (loading) {
    return <div className="text-sm text-muted-foreground">加载中…</div>;
  }

  return (
    <div className="space-y-6">
      {variant === "page" ? (
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">超分去模糊</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            调用 Replicate 超分与 LaMa 物体移除，自动根据图片内容（人脸 / 动漫 / 通用）路由到不同超分模型；局部重绘使用 LaMa 系 inpainting。全站共用一套 API Token。
          </p>
        </div>
      ) : null}

      {saved ? (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          已保存。
        </div>
      ) : null}

      {/* ── 凭证 & 全局开关 ── */}
      <SectionCard
        title="Replicate API 凭证"
        tips="在 replicate.com 获取 API Token（r8_ 开头）。Token 仅存服务端，接口不返回明文。"
      >
        <form onSubmit={handleSave} className="max-w-xl space-y-4">
          <FormField
            label="API Token"
            hint={apiTokenSet ? "已保存。填写新值覆盖；留空不改。" : "格式 r8_…；填写后方可启用去模糊。"}
          >
            <input
              className="input w-full font-mono text-xs"
              type="password"
              value={apiTokenNew}
              onChange={(e) => setApiTokenNew(e.target.value)}
              autoComplete="off"
              placeholder={apiTokenSet ? "（留空则保持）" : "r8_…"}
            />
          </FormField>
          {apiTokenSet ? (
            <button
              type="button"
              className="text-xs text-muted-foreground underline hover:text-foreground"
              onClick={handleClearToken}
              disabled={saving}
            >
              清空已保存的 API Token
            </button>
          ) : null}
          <FormField
            label="默认路由类型"
            hint="未传 type 参数时使用此值。auto 会先调用 BLIP 图像描述分析内容后自动路由。"
          >
            <select
              className="input w-full"
              value={defaultType}
              onChange={(e) => setDefaultType(e.target.value as typeof defaultType)}
            >
              <option value="auto">auto — 自动检测（BLIP 分析 → 人脸 / 动漫 / 通用）</option>
              <option value="face">face — 人脸修复（CodeFormer，upscale×2）</option>
              <option value="general">general — 通用超分（Real-ESRGAN，scale×2/4）</option>
              <option value="anime">anime — 动漫插画（Anime Upscaler）</option>
            </select>
          </FormField>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="rounded border-border"
            />
            启用公开超分代理（关闭时公开接口将返回不可用）
          </label>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "保存中…" : "保存"}
          </button>
        </form>
      </SectionCard>

      {/* ── 模型引用配置 ── */}
      <SectionCard
        title="模型引用"
        tips="格式为 owner/name 或 owner/name:version（64 位十六进制）。留空恢复内置默认值。"
      >
        <form onSubmit={handleSaveModels} className="max-w-xl space-y-4">
          <FormField
            label="人脸修复模型（CodeFormer）"
            hint="检测到人脸时调用，固定 upscale=2。默认：sczhou/codeformer"
          >
            <input
              className="input w-full font-mono text-xs"
              value={codeformerRef}
              onChange={(e) => setCodeformerRef(e.target.value)}
              placeholder="sczhou/codeformer"
              autoComplete="off"
            />
          </FormField>
          <FormField
            label="通用超分模型（Real-ESRGAN）"
            hint="通用风景/静物时调用，scale 由请求 scale 字段决定（2 或 4）。默认：philz1337x/clarity-upscaler（ControlNet-Tile + SD，效果更佳）；也可填 nightmareai/real-esrgan（速度更快）"
          >
            <input
              className="input w-full font-mono text-xs"
              value={realEsrganRef}
              onChange={(e) => setRealEsrganRef(e.target.value)}
              placeholder="philz1337x/clarity-upscaler"
              autoComplete="off"
            />
          </FormField>
          <FormField
            label="动漫超分模型（Anime Upscaler）"
            hint="检测到动漫/插画时调用。默认：psychic-canvas/anime-upscaler"
          >
            <input
              className="input w-full font-mono text-xs"
              value={animeUpscalerRef}
              onChange={(e) => setAnimeUpscalerRef(e.target.value)}
              placeholder="psychic-canvas/anime-upscaler"
              autoComplete="off"
            />
          </FormField>
          <FormField
            label="LaMa / 物体移除模型（POST /v1/inpainting）"
            hint="须支持 Replicate 输入 image、mask。默认 zylim0702/remove-object；可改为 allenhooo/lama 等文档兼容模型"
          >
            <input
              className="input w-full font-mono text-xs"
              value={lamaInpaintRef}
              onChange={(e) => setLamaInpaintRef(e.target.value)}
              placeholder="zylim0702/remove-object"
              autoComplete="off"
            />
          </FormField>
          <FormField
            label="专业证件照模型（POST /v1/pro-headshot）"
            hint="建议使用可直接生成职业证件照的公开模型。默认 flux-kontext-apps/professional-headshot；用于根据 image + 业务参数生成职业证件照。"
          >
            <input
              className="input w-full font-mono text-xs"
              value={proHeadshotRef}
              onChange={(e) => setProHeadshotRef(e.target.value)}
              placeholder="flux-kontext-apps/professional-headshot"
              autoComplete="off"
            />
          </FormField>
          <FormField
            label="BLIP 图像描述模型（auto 路由用）"
            hint="type=auto 时先调用此模型分析图片内容。传空字符串则 auto 直接回落到 general。"
          >
            <input
              className="input w-full font-mono text-xs"
              value={blipRef}
              onChange={(e) => setBlipRef(e.target.value)}
              placeholder="salesforce/blip:2e1dddc8…"
              autoComplete="off"
            />
          </FormField>
          <button type="submit" className="btn btn-secondary btn-sm" disabled={saving}>
            {saving ? "保存中…" : "保存模型引用"}
          </button>
        </form>
      </SectionCard>

      {/* ── 公开接口说明 ── */}
      <SectionCard
        title="公开接口（应用鉴权 + 积分）"
        tips="Header X-App-Key（应用 API Key）必填。可选 X-User-Id 或 X-Api-Key：识别到用户时 colorize 每次扣 1 分，unblur 为 standard 扣 1 分/次、strong 扣 3 分/次，inpainting 每次扣 1 分，pro-headshot 按 outputs=1/2/4 扣同等积分；失败按实际扣分退回。未识别时与其它公开消费级接口相同规则：同一应用、同一 IP 每 UTC 日共 1 次免费。"
      >
        <div className="space-y-3 text-sm">
          <div className="flex items-start gap-2 rounded-lg bg-muted/40 px-3 py-2 font-mono text-xs break-all">
            <Plug className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <div className="text-muted-foreground">POST 黑白图上色（字段 image + model）</div>
              <div>{colorizeUrl}</div>
            </div>
          </div>
          <div className="flex items-start gap-2 rounded-lg bg-muted/40 px-3 py-2 font-mono text-xs break-all">
            <Plug className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <div className="text-muted-foreground">POST 超分去模糊（字段 image）</div>
              <div>{onblurUrl}</div>
            </div>
          </div>
          <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs space-y-1">
            <div className="text-muted-foreground font-medium mb-1">/v1/colorize 请求字段</div>
            <div>
              <span className="font-mono text-foreground">image</span>
              <span className="text-muted-foreground ml-2">必填 — 原图（规则同 unblur 的 image）</span>
            </div>
            <div>
              <span className="font-mono text-foreground">model</span>
              <span className="text-muted-foreground ml-2">可选 — large / tiny（覆盖 DDColor 默认 model_size）</span>
            </div>
          </div>
          <div className="flex items-start gap-2 rounded-lg bg-muted/40 px-3 py-2 font-mono text-xs break-all">
            <Plug className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <div className="text-muted-foreground">POST 物体移除 / 局部重绘（字段 image + mask，LaMa）</div>
              <div>{inpaintingUrl}</div>
            </div>
          </div>
          <div className="flex items-start gap-2 rounded-lg bg-muted/40 px-3 py-2 font-mono text-xs break-all">
            <Plug className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <div className="text-muted-foreground">POST 专业证件照（字段 image + size/background/outfit/useCase/outputs）</div>
              <div>{proHeadshotUrl}</div>
            </div>
          </div>
          <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs space-y-1">
            <div className="text-muted-foreground font-medium mb-1">/v1/unblur 请求字段</div>
            <div>
              <span className="font-mono text-foreground">image</span>
              <span className="text-muted-foreground ml-2">必填 — 二进制文件上传，或文本（https URL / base64 / data URL）</span>
            </div>
            <div>
              <span className="font-mono text-foreground">type</span>
              <span className="text-muted-foreground ml-2">
                可选 — <span className="font-mono">auto</span> | <span className="font-mono">face</span> | <span className="font-mono">general</span> | <span className="font-mono">anime</span>（默认 auto）
              </span>
            </div>
            <div>
              <span className="font-mono text-foreground">scale</span>
              <span className="text-muted-foreground ml-2">可选 — 2 或 4（仅对 general 模式生效，默认 4）</span>
            </div>
            <div>
              <span className="font-mono text-foreground">strength</span>
              <span className="text-muted-foreground ml-2">可选 — standard（1 分）或 strong（3 分）</span>
            </div>
          </div>
          <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs space-y-1">
            <div className="text-muted-foreground font-medium mb-1">/v1/inpainting 请求字段</div>
            <div>
              <span className="font-mono text-foreground">image</span>
              <span className="text-muted-foreground ml-2">必填 — 原图（规则同 unblur 的 image）</span>
            </div>
            <div>
              <span className="font-mono text-foreground">mask</span>
              <span className="text-muted-foreground ml-2">必填 — 遮罩图（需移除/修复区域，规则同上）。每次 1 分</span>
            </div>
          </div>
          <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs space-y-1">
            <div className="text-muted-foreground font-medium mb-1">/v1/pro-headshot 请求字段</div>
            <div>
              <span className="font-mono text-foreground">image</span>
              <span className="text-muted-foreground ml-2">必填 — 原图（规则同 unblur 的 image）</span>
            </div>
            <div>
              <span className="font-mono text-foreground">size</span>
              <span className="text-muted-foreground ml-2">可选 — 1:1 / 4:5 / 2:3（默认 4:5）</span>
            </div>
            <div>
              <span className="font-mono text-foreground">background</span>
              <span className="text-muted-foreground ml-2">可选 — studio-gray / pure-white / office-blur / deep-blue</span>
            </div>
            <div>
              <span className="font-mono text-foreground">outfit</span>
              <span className="text-muted-foreground ml-2">可选 — business-formal / business-casual / blazer / shirt</span>
            </div>
            <div>
              <span className="font-mono text-foreground">useCase</span>
              <span className="text-muted-foreground ml-2">可选 — linkedin / resume / company-profile / id-photo</span>
            </div>
            <div>
              <span className="font-mono text-foreground">outputs</span>
              <span className="text-muted-foreground ml-2">可选 — "1" / "2" / "4"（字符串），并按 1/2/4 扣对应积分</span>
            </div>
          </div>
          <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs space-y-1">
            <div className="text-muted-foreground font-medium mb-1">响应体</div>
            <div>
              <span className="font-mono text-foreground">outputUrl</span>
              <span className="text-muted-foreground ml-2">colorize、unblur、inpainting 均返回此字段（公网可访问图片 URL）</span>
            </div>
            <div>
              <span className="font-mono text-foreground">routedType</span>
              <span className="text-muted-foreground ml-2">仅 unblur 返回，值为 face / general / anime</span>
            </div>
            <div>
              <span className="font-mono text-foreground">outputUrls</span>
              <span className="text-muted-foreground ml-2">仅 pro-headshot 返回，值为结果图 URL 数组</span>
            </div>
          </div>
          <Tips title="自动路由规则（type=auto）">
            <div className="space-y-1">
              <div>① 调用 BLIP 图像描述模型分析图片内容</div>
              <div>
                ② Caption 含 <span className="font-mono text-foreground">anime / cartoon / manga</span> 等 →
                psychic-canvas/anime-upscaler
              </div>
              <div>
                ③ Caption 含 <span className="font-mono text-foreground">person / face / portrait</span> 等 →
                sczhou/codeformer（upscale×2）
              </div>
              <div>④ 其他 / BLIP 失败 → xinntao/real-esrgan（scale×4）</div>
            </div>
          </Tips>
          <Tips>
            模型文档：{" "}
            <a
              className="text-primary underline"
              href="https://replicate.com/sczhou/codeformer"
              target="_blank"
              rel="noreferrer"
            >
              sczhou/codeformer
            </a>
            {" · "}
            <a
              className="text-primary underline"
              href="https://replicate.com/xinntao/real-esrgan"
              target="_blank"
              rel="noreferrer"
            >
              xinntao/real-esrgan
            </a>
            {" · "}
            <a
              className="text-primary underline"
              href="https://replicate.com/psychic-canvas/anime-upscaler"
              target="_blank"
              rel="noreferrer"
            >
              psychic-canvas/anime-upscaler
            </a>
          </Tips>
        </div>
      </SectionCard>

      {/* ── DDColor（并入本页） ── */}
      <SectionCard
        title="DDColor 上色（已并入）"
        tips="上色能力已并入本页管理：配置项与超分共用 /integrations/replicate，调用接口为 /api/v1/colorize。"
      >
        <form onSubmit={handleSaveDdcolor} className="max-w-xl space-y-4">
          <FormField
            label="DDColor API Token"
            hint={ddApiTokenSet ? "已保存。填写新值覆盖；留空不改。" : "格式 r8_…；填写后方可启用上色。"}
          >
            <input
              className="input w-full font-mono text-xs"
              type="password"
              value={ddApiTokenNew}
              onChange={(e) => setDdApiTokenNew(e.target.value)}
              autoComplete="off"
              placeholder={ddApiTokenSet ? "（留空则保持）" : "r8_…"}
            />
          </FormField>
          {ddApiTokenSet ? (
            <button
              type="button"
              className="text-xs text-muted-foreground underline hover:text-foreground"
              onClick={handleClearDdToken}
              disabled={saving}
            >
              清空已保存的 DDColor API Token
            </button>
          ) : null}
          <FormField
            label="默认 model_size"
            hint="large 效果更佳，tiny 速度更快。可在 /v1/colorize 调用时通过 model 字段覆盖。"
          >
            <select
              className="input w-full"
              value={ddDefaultModelSize}
              onChange={(e) => setDdDefaultModelSize(e.target.value as "large" | "tiny")}
            >
              <option value="large">large（推荐，效果更佳）</option>
              <option value="tiny">tiny（速度更快）</option>
            </select>
          </FormField>
          <FormField
            label="模型版本 ID（可选）"
            hint="64 位十六进制；留空使用内置默认版本。"
          >
            <input
              className="input w-full font-mono text-xs"
              value={ddVersion}
              onChange={(e) => setDdVersion(e.target.value)}
              placeholder="（留空使用默认）"
              autoComplete="off"
            />
          </FormField>
          <p className="text-xs text-muted-foreground">
            当前版本：<span className="font-mono">{ddVersion}</span>
            {ddVersionIsDefault ? "（内置默认）" : "（自定义）"}
          </p>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={ddEnabled}
              onChange={(e) => setDdEnabled(e.target.checked)}
              className="rounded border-border"
            />
            启用公开上色代理（关闭时 /v1/colorize 返回不可用）
          </label>
          <button type="submit" className="btn btn-secondary btn-sm" disabled={saving}>
            {saving ? "保存中…" : "保存 DDColor 设置"}
          </button>
        </form>
      </SectionCard>
    </div>
  );
}
