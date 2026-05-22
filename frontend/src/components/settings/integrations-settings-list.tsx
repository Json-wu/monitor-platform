"use client";

import { type ReactNode, useCallback, useEffect, useState } from "react";
import { BookOpen, Pencil, Power } from "lucide-react";
import { apiGet, apiPatch } from "@/lib/api";
import { SectionCard } from "@/components/section-card";
import { Modal } from "@/components/ui/modal";
import { LinkmePaySettingsPanel } from "./linkmepay-settings-panel";
import { RemoveBgApiPanel } from "./remove-bg-api-panel";
import { SmtpSettingsPanel } from "./smtp-settings-panel";
import { KlingImageSettingsPanel } from "./kling-image-settings-panel";
import { UpscaleSettingsPanel } from "./upscale-settings-panel";
import { GumroadSettingsPanel } from "./gumroad-settings-panel";

export type IntegrationChannelId =
  | "linkmePay"
  | "gumroad"
  | "clearbg"
  | "smtp"
  | "klingImage"
  | "replicate";

type OverviewSlice = {
  enabled: boolean;
  configured: boolean;
};

type IntegrationsOverviewResponse = {
  clearbg: OverviewSlice;
  linkmePay: OverviewSlice;
  gumroad: OverviewSlice;
  smtp: OverviewSlice;
  klingImage: OverviewSlice;
  replicate: OverviewSlice;
};

const CHANNELS: {
  id: IntegrationChannelId;
  name: string;
  summary: string;
}[] = [
  { id: "linkmePay", name: "LinkMePay", summary: "代收；官网通过 Monitor 创建订单与回调验签" },
  {
    id: "gumroad",
    name: "Gumroad",
    summary: "产品销售 Ping；按 seller_id 验签，按 payment_link 匹配方案并发放积分",
  },
  { id: "clearbg", name: "抠图上游 API", summary: "第三方去背服务；公开 POST /api/v1/clearbg 走此上游" },
  { id: "smtp", name: "发信 SMTP", summary: "验证码、通知模板等发信出口（全站一套）" },
  {
    id: "klingImage",
    name: "可灵生图",
    summary: "可灵 JWT；公开生图；可选 X-User-Id 扣 1 分/次，否则 IP 日限 1 次免费",
  },
  {
    id: "replicate",
    name: "Replicate",
    summary: "Replicate colorize 1 分；unblur 1/3 分；inpainting 1 分；pro-headshot 按 outputs=1/2/4 分",
  },
];

const HELP: Record<IntegrationChannelId, { title: string; body: ReactNode }> = {
  linkmePay: {
    title: "LinkMePay 使用说明",
    body: (
      <div className="space-y-3 text-sm text-muted-foreground">
        <p>
          在 LinkMePay 商户后台获取 <span className="font-mono text-foreground">pid</span> 与{" "}
          <span className="font-mono text-foreground">secretKey</span>，填写默认{" "}
          <span className="font-mono text-foreground">action</span>（如 SN20108 PayPal）。
        </p>
        <p>
          <strong className="text-foreground">notifyPublicBase</strong> 填 Monitor 对外公网根地址（无尾斜杠），用于拼接异步通知
          URL；本地联调需 ngrok 等公网入口。
        </p>
        <p>
          官网创建代收：POST Monitor 公开接口，Header 带 <span className="font-mono text-foreground">X-App-Key</span>，Query{" "}
          <span className="font-mono text-foreground">slug</span>；密钥不落浏览器。
        </p>
        <p className="text-xs">禁用后，所有应用的代收下单将返回服务不可用。</p>
      </div>
    ),
  },
  gumroad: {
    title: "Gumroad 使用说明",
    body: (
      <div className="space-y-3 text-sm text-muted-foreground">
        <p>
          在 Gumroad → <strong className="text-foreground">Settings → Advanced</strong> 将 Ping endpoint 设为 Monitor 公网地址下的{" "}
          <span className="font-mono text-foreground">/api/payment/webhooks/gumroad</span>。
        </p>
        <p>
          填写本页的 <span className="font-mono text-foreground">Seller ID</span>，须与 Ping 体里的{" "}
          <span className="font-mono text-foreground">seller_id</span> 一致。
        </p>
        <p>
          各定价方案的「支付链接」填 Gumroad 产品 URL，Webhook 才能匹配方案；买家邮箱须与站内注册用户一致。
        </p>
        <p className="text-xs">未配置 seller_id 时，Ping 返回「Gumroad integration is not configured」。</p>
      </div>
    ),
  },
  clearbg: {
    title: "抠图上游 API 使用说明",
    body: (
      <div className="space-y-3 text-sm text-muted-foreground">
        <p>
          填写上游提供的 <span className="font-mono text-foreground">POST</span> 地址（如 Pixian remove-background），以及需要的
          HTTP Basic 用户名与密码。
        </p>
        <p>
          终端用户通过官网申请的 API Key 走 <span className="font-mono text-foreground">/api/v1/clearbg</span>；Monitor
          代理到本配置的上游，不在前端暴露上游密码。
        </p>
        <p className="text-xs">禁用后，公开抠图接口将对所有应用返回不可用。</p>
      </div>
    ),
  },
  smtp: {
    title: "SMTP 使用说明",
    body: (
      <div className="space-y-3 text-sm text-muted-foreground">
        <p>配置主机、端口、账号与发件人；密码仅存服务端，接口响应中不会返回明文。</p>
        <p>注册验证码、通知广播等邮件均走此 SMTP；与「通知」模板配置配合使用。</p>
        <p className="text-xs">禁用后，生产环境发信将失败；开发环境可能仅记录日志。</p>
      </div>
    ),
  },
  klingImage: {
    title: "可灵生图使用说明",
    body: (
      <div className="space-y-3 text-sm text-muted-foreground">
        <p>
          在可灵开放平台获取 <span className="font-mono text-foreground">AccessKey</span> 与{" "}
          <span className="font-mono text-foreground">SecretKey</span>（见 document-api 通用说明：由二者生成短期
          JWT，请求头 <span className="font-mono text-foreground">Authorization: Bearer …</span>
          调官方接口）。
        </p>
        <p>
          对外调用：Query <span className="font-mono text-foreground">slug</span> + Header{" "}
          <span className="font-mono text-foreground">X-App-Key</span>；可选{" "}
          <span className="font-mono text-foreground">X-User-Id</span>（终端用户 UUID，与抠图相同）：识别用户则每次生图扣 1
          积分，失败退回；未带时与抠图<strong className="text-foreground">共用</strong>匿名日限表（每应用、每 IP、每 UTC 日共 1 次免费）。POST{" "}
          <span className="font-mono text-foreground">/api/public/image-generation/generate</span> 或{" "}
          <span className="font-mono text-foreground">…/turing</span>。
        </p>
        <p>
          Monitor 按参考图张数自动选择官方{" "}
          <span className="font-mono text-foreground">/v1/images/generations</span>（0–1 张）或{" "}
          <span className="font-mono text-foreground">/v1/images/multi-image2image</span>（2–4 张）；异步轮询时
          taskId 带 <span className="font-mono text-foreground">gen:</span> /{" "}
          <span className="font-mono text-foreground">mi2i:</span> 前缀。
        </p>
        <p className="text-xs">禁用后，所有应用的公开生图接口将返回服务不可用。</p>
      </div>
    ),
  },
  replicate: {
    title: "Replicate 统一集成使用说明",
    body: (
      <div className="space-y-3 text-sm text-muted-foreground">
        <p>
          在{" "}
          <a className="text-primary underline" href="https://replicate.com" target="_blank" rel="noreferrer">
            replicate.com
          </a>{" "}
          注册并生成 API Token（<span className="font-mono text-foreground">r8_…</span>），填入本配置。
          与 DDColor 上色使用同一平台，可共用同一个 Token（分别配置在各自集成设置中）。
        </p>
        <p>
          <strong className="text-foreground">自动路由规则（type=auto）：</strong>
          先调用 BLIP 图像描述分析图片内容：检测到<em>动漫/插画</em>关键词 → psychic-canvas/anime-upscaler；
          检测到<em>人脸/人物</em>关键词 → sczhou/codeformer（upscale×2）；其他或 BLIP 失败 → xinntao/real-esrgan（scale×4）。
          也可通过 <span className="font-mono text-foreground">type</span> 参数指定 <span className="font-mono text-foreground">face / general / anime</span> 直接路由。
        </p>
        <p>
          对外调用：Header <span className="font-mono text-foreground">X-App-Key</span> 必填；
          可选 <span className="font-mono text-foreground">X-User-Id</span> / <span className="font-mono text-foreground">X-Api-Key</span>：
          识别到终端用户：strength=standard 每次扣 1 分，strength=strong 每次扣 3 分，失败按实际扣分退回；未识别时同一 IP 每 UTC 日共 1 次免费。
        </p>
        <p>
          POST{" "}
          <span className="font-mono text-foreground">/api/v1/colorize</span>（黑白图上色，1 分）；
          POST{" "}
          <span className="font-mono text-foreground">/api/v1/unblur</span>，响应体{" "}
          <span className="font-mono text-foreground">{"{ outputUrl, routedType }"}</span>（strength=standard/strong 对应 1/3 分）；POST{" "}
          <span className="font-mono text-foreground">/api/v1/inpainting</span>（原图 + 遮罩，LaMa 物体移除），无 strength，每次 1 分，响应体{" "}
          <span className="font-mono text-foreground">{"{ outputUrl }"}</span>；POST{" "}
          <span className="font-mono text-foreground">/api/v1/pro-headshot</span>（专业证件照，按 outputs=1/2/4 扣同等积分），响应体{" "}
          <span className="font-mono text-foreground">{"{ outputUrls }"}</span>。匿名日限等规则与对外说明一致。
        </p>
        <p className="text-xs">禁用后，公开上色、超分、物体移除、专业证件照接口将对所有应用返回服务不可用。</p>
      </div>
    ),
  },
};

function statusLabel(row: OverviewSlice): { text: string; className: string } {
  if (!row.enabled) {
    return { text: "已禁用", className: "text-muted-foreground" };
  }
  if (row.configured) {
    return { text: "已就绪", className: "text-emerald-400" };
  }
  return { text: "未完成", className: "text-amber-400" };
}

export function IntegrationsSettingsList({ appId }: { appId: string }) {
  const [overview, setOverview] = useState<IntegrationsOverviewResponse | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [toggling, setToggling] = useState<IntegrationChannelId | null>(null);
  const [helpOpen, setHelpOpen] = useState<IntegrationChannelId | null>(null);
  const [editOpen, setEditOpen] = useState<IntegrationChannelId | null>(null);

  const fetchOverview = useCallback(async () => {
    setLoadErr("");
    try {
      const data = await apiGet<IntegrationsOverviewResponse>(`/apps/${appId}/integrations`);
      setOverview(data);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "加载失败");
    }
  }, [appId]);

  useEffect(() => {
    void fetchOverview();
  }, [fetchOverview]);

  const slice = (id: IntegrationChannelId): OverviewSlice | null => {
    if (!overview) return null;
    if (id === "clearbg") return overview.clearbg;
    if (id === "linkmePay") return overview.linkmePay;
    if (id === "gumroad") return overview.gumroad ?? { enabled: false, configured: false };
    if (id === "klingImage") return overview.klingImage ?? { enabled: false, configured: false };
    if (id === "replicate")
      return overview.replicate ?? { enabled: false, configured: false };
    return overview.smtp;
  };

  async function toggleEnabled(id: IntegrationChannelId) {
    const row = slice(id);
    if (!row) return;
    const next = !row.enabled;
    setToggling(id);
    setLoadErr("");
    try {
      if (id === "linkmePay") {
        await apiPatch(`/apps/${appId}/integrations/linkme-pay`, { enabled: next });
      } else if (id === "gumroad") {
        await apiPatch(`/apps/${appId}/integrations/gumroad`, { enabled: next });
      } else if (id === "clearbg") {
        await apiPatch(`/apps/${appId}/clearbg-settings`, { enabled: next });
      } else if (id === "klingImage") {
        await apiPatch(`/apps/${appId}/integrations/kling-image`, { enabled: next });
      } else if (id === "replicate") {
        await apiPatch(`/apps/${appId}/integrations/replicate`, { enabled: next });
      } else {
        await apiPatch(`/apps/${appId}/smtp-settings`, { enabled: next });
      }
      await fetchOverview();
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "切换失败");
    } finally {
      setToggling(null);
    }
  }

  const afterPanelSave = useCallback(() => {
    void fetchOverview();
    setEditOpen(null);
  }, [fetchOverview]);

  return (
    <>
      <SectionCard
        title="集成渠道"
        description="全站共用；列表可快速禁用或打开编辑。未完成时请补全凭证并勾选启用。"
      >
        {loadErr ? (
          <p className="mb-3 text-sm text-red-400">{loadErr}</p>
        ) : null}
        {!overview ? (
          <p className="text-sm text-muted-foreground">加载中…</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>集成</th>
                  <th>说明</th>
                  <th>状态</th>
                  <th className="w-[280px]">操作</th>
                </tr>
              </thead>
              <tbody>
                {CHANNELS.map((ch) => {
                  const row = slice(ch.id)!;
                  const st = statusLabel(row);
                  const busy = toggling === ch.id;
                  return (
                    <tr key={ch.id} id={ch.id === "clearbg" ? "clearbg" : undefined}>
                      <td className="font-medium">{ch.name}</td>
                      <td className="max-w-md text-xs text-muted-foreground">{ch.summary}</td>
                      <td>
                        <span className={`text-xs font-medium ${st.className}`}>{st.text}</span>
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm inline-flex items-center gap-1"
                            onClick={() => setHelpOpen(ch.id)}
                          >
                            <BookOpen className="h-3.5 w-3.5" />
                            使用说明
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm inline-flex items-center gap-1"
                            onClick={() => setEditOpen(ch.id)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            编辑
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm inline-flex items-center gap-1"
                            disabled={busy}
                            onClick={() => void toggleEnabled(ch.id)}
                          >
                            <Power className="h-3.5 w-3.5" />
                            {row.enabled ? "禁用" : "启用"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {helpOpen ? (
        <Modal open title={HELP[helpOpen].title} onClose={() => setHelpOpen(null)}>
          <div className="text-foreground">{HELP[helpOpen].body}</div>
          <div className="mt-6 flex justify-end">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setHelpOpen(null)}>
              关闭
            </button>
          </div>
        </Modal>
      ) : null}

      {editOpen === "linkmePay" ? (
        <Modal
          open
          wide
          title="编辑 LinkMePay"
          onClose={() => setEditOpen(null)}
        >
          <LinkmePaySettingsPanel appId={appId} variant="dialog" onSaved={afterPanelSave} />
        </Modal>
      ) : null}

      {editOpen === "gumroad" ? (
        <Modal open wide title="编辑 Gumroad" onClose={() => setEditOpen(null)}>
          <GumroadSettingsPanel appId={appId} variant="dialog" onSaved={afterPanelSave} />
        </Modal>
      ) : null}

      {editOpen === "clearbg" ? (
        <Modal open wide title="编辑抠图上游 API" onClose={() => setEditOpen(null)}>
          <RemoveBgApiPanel appId={appId} variant="dialog" onSaved={afterPanelSave} />
        </Modal>
      ) : null}

      {editOpen === "smtp" ? (
        <Modal open wide title="编辑发信 SMTP" onClose={() => setEditOpen(null)}>
          <SmtpSettingsPanel appId={appId} variant="dialog" onSaved={afterPanelSave} />
        </Modal>
      ) : null}

      {editOpen === "klingImage" ? (
        <Modal open wide title="编辑可灵生图" onClose={() => setEditOpen(null)}>
          <KlingImageSettingsPanel appId={appId} variant="dialog" onSaved={afterPanelSave} />
        </Modal>
      ) : null}

      {editOpen === "replicate" ? (
        <Modal open wide title="编辑 Replicate 集成" onClose={() => setEditOpen(null)}>
          <UpscaleSettingsPanel appId={appId} variant="dialog" onSaved={afterPanelSave} />
        </Modal>
      ) : null}
    </>
  );
}
