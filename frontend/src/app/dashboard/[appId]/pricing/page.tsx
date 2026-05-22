"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, Pencil, Plus, Power, Trash2 } from "lucide-react";
import {
  apiGet,
  apiGetScoped,
  apiPostScoped,
  apiPut,
  apiDelete,
} from "@/lib/api";
import { useCurrentApp } from "@/lib/app-context";
import { SectionCard } from "@/components/section-card";
import { Modal } from "@/components/ui/modal";
import { FormField } from "@/components/ui/form-field";
import { Tips } from "@/components/ui/tips";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DEFAULT_PRICING_PAGE,
  mergePricingPage,
  PricingPreview,
  type PricingPageCopy,
} from "@/components/pricing-preview";
import { PLAN_ICON_PRESETS, PlanPresetIcon } from "@/lib/plan-icon-presets";
import {
  defaultDisplaySlots,
  DISPLAY_SLOTS,
  parseDisplaySlots,
  type DisplaySlot,
} from "@/lib/pricing-plan-display";
import { useShowApiError } from "@/lib/show-api-error";

interface Plan {
  id: string;
  name: string;
  slug: string;
  price: number;
  currency: string;
  billingInterval: string;
  creditsPerCycle: number;
  features: string[] | null;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  metadata?: unknown;
  paymentLink?: string | null;
}

const intervals = [
  { value: "monthly", label: "按月" },
  { value: "yearly", label: "按年" },
  { value: "one_time", label: "一次性" },
];

const billingIntervalLabel: Record<string, string> = {
  monthly: "按月",
  yearly: "按年",
  one_time: "一次性",
};

type PlanFormState = {
  /** 展示序号；新建时留空表示由后端自动排在末尾 */
  sortOrder: string;
  name: string;
  slug: string;
  billingInterval: string;
  price: string;
  currency: string;
  creditsPerCycle: string;
  description: string;
  features: string;
  highlight: boolean;
  badge: string;
  creditsLine: string;
  perImageLine: string;
  ctaLabel: string;
  ctaHref: string;
  ctaEnabled: boolean;
  displayProductList: boolean;
  displayQuickEntry: boolean;
  /** crown | sparkles | gem | award | "" */
  planIconPreset: string;
  /** 第三方支付页直链（如 Gumroad 产品 URL） */
  paymentLink: string;
};

const emptyPlan = (): PlanFormState => ({
  sortOrder: "",
  name: "",
  slug: "",
  billingInterval: "monthly",
  price: "",
  currency: "usd",
  creditsPerCycle: "",
  description: "",
  features: "",
  highlight: false,
  badge: "",
  creditsLine: "",
  perImageLine: "",
  ctaLabel: "",
  ctaHref: "",
  ctaEnabled: true,
  displayProductList: true,
  displayQuickEntry: false,
  planIconPreset: "",
  paymentLink: "",
});

function slotsToFormFlags(
  slots: DisplaySlot[],
): Pick<PlanFormState, "displayProductList" | "displayQuickEntry"> {
  return {
    displayProductList: slots.includes("product_list"),
    displayQuickEntry: slots.includes("quick_entry"),
  };
}

function readPlanMeta(
  metadata: unknown,
  billingInterval: string,
): Partial<PlanFormState> {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return slotsToFormFlags(defaultDisplaySlots(billingInterval));
  }
  const m = metadata as Record<string, unknown>;
  const slots = parseDisplaySlots(metadata, billingInterval);
  return {
    highlight: m.highlight === true,
    badge: typeof m.badge === "string" ? m.badge : "",
    creditsLine: typeof m.creditsLine === "string" ? m.creditsLine : "",
    perImageLine: typeof m.perImageLine === "string" ? m.perImageLine : "",
    ctaLabel: typeof m.ctaLabel === "string" ? m.ctaLabel : "",
    ctaHref: typeof m.ctaHref === "string" ? m.ctaHref : "",
    ctaEnabled: m.ctaEnabled !== false,
    planIconPreset: typeof m.planIconPreset === "string" ? m.planIconPreset : "",
    ...slotsToFormFlags(slots),
  };
}

function buildPlanMetadata(f: PlanFormState): Record<string, unknown> {
  const out: Record<string, unknown> = { highlight: f.highlight };
  if (f.badge.trim()) out.badge = f.badge.trim();
  if (f.creditsLine.trim()) out.creditsLine = f.creditsLine.trim();
  if (f.perImageLine.trim()) out.perImageLine = f.perImageLine.trim();
  if (f.ctaLabel.trim()) out.ctaLabel = f.ctaLabel.trim();
  if (f.ctaHref.trim()) out.ctaHref = f.ctaHref.trim();
  if (!f.ctaEnabled) out.ctaEnabled = false;
  if (f.planIconPreset.trim()) out.planIconPreset = f.planIconPreset.trim();
  const slots: DisplaySlot[] = [];
  if (f.displayProductList) slots.push("product_list");
  if (f.displayQuickEntry) slots.push("quick_entry");
  out.displaySlots =
    slots.length > 0 ? slots : defaultDisplaySlots(f.billingInterval);
  return out;
}

const displaySlotLabel: Record<DisplaySlot, string> = {
  product_list: "产品列表",
  quick_entry: "快捷入口",
};

export default function PricingPage() {
  const app = useCurrentApp();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [showPreview, setShowPreview] = useState(true);
  const showApiError = useShowApiError();

  const [pageCopy, setPageCopy] = useState<Required<PricingPageCopy>>(DEFAULT_PRICING_PAGE);

  const [planModal, setPlanModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [planForm, setPlanForm] = useState<PlanFormState>(emptyPlan);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Plan | null>(null);

  const load = useCallback(async () => {
    try {
      const p = await apiGetScoped<{ data: Plan[] }>("/pricing/plans", app.id);
      setPlans(p.data);
    } catch (err) {
      showApiError(err);
    }
    try {
      const a = await apiGet<{ pricingPage?: unknown }>(`/apps/${app.id}`);
      setPageCopy(mergePricingPage({ pricingPage: a.pricingPage }));
    } catch {
      setPageCopy({ ...DEFAULT_PRICING_PAGE });
    }
  }, [app.id, showApiError]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSavePageCopy() {
    setSaving(true);
    try {
      await apiPut(`/pricing/page-preview?appId=${encodeURIComponent(app.id)}`, pageCopy);
    } catch (err) {
      showApiError(err);
    } finally {
      setSaving(false);
    }
  }

  function openCreatePlan() {
    setEditingPlan(null);
    setPlanForm(emptyPlan());
    setPlanModal(true);
  }

  function openEditPlan(p: Plan) {
    const meta = readPlanMeta(p.metadata, p.billingInterval);
    setEditingPlan(p);
    setPlanForm({
      sortOrder: String(p.sortOrder ?? 0),
      name: p.name,
      slug: p.slug,
      billingInterval: p.billingInterval,
      price: String(p.price),
      currency: p.currency,
      creditsPerCycle: String(p.creditsPerCycle),
      description: p.description ?? "",
      features: Array.isArray(p.features) ? p.features.join("\n") : "",
      highlight: meta.highlight ?? false,
      badge: meta.badge ?? "",
      creditsLine: meta.creditsLine ?? "",
      perImageLine: meta.perImageLine ?? "",
      ctaLabel: meta.ctaLabel ?? "",
      ctaHref: meta.ctaHref ?? "",
      ctaEnabled: meta.ctaEnabled ?? true,
      displayProductList: meta.displayProductList ?? true,
      displayQuickEntry: meta.displayQuickEntry ?? false,
      planIconPreset: meta.planIconPreset ?? "",
      paymentLink: p.paymentLink ?? "",
    });
    setPlanModal(true);
  }

  async function handlePlanSave() {
    setSaving(true);
    try {
      const sortTrim = planForm.sortOrder.trim();
      if (sortTrim !== "") {
        const n = Number(sortTrim);
        if (!Number.isInteger(n) || n < 0) {
          showApiError("序号须为非负整数");
          setSaving(false);
          return;
        }
      } else if (editingPlan) {
        showApiError("请填写展示序号（非负整数）");
        setSaving(false);
        return;
      }
      const metadata = buildPlanMetadata(planForm);
      const descriptionTrimmed = planForm.description.trim();
      const paymentLinkTrimmed = planForm.paymentLink.trim();
      const body: Record<string, unknown> = {
        name: planForm.name,
        billingInterval: planForm.billingInterval,
        price: Number(planForm.price),
        currency: planForm.currency,
        creditsPerCycle: Number(planForm.creditsPerCycle),
        /** Explicit `null` clears DB; omitting left the old value; empty must not become "0". */
        description: descriptionTrimmed === "" ? null : descriptionTrimmed,
        features: planForm.features ? planForm.features.split("\n").filter(Boolean) : [],
        paymentLink: paymentLinkTrimmed === "" ? null : paymentLinkTrimmed,
        metadata,
      };
      if (sortTrim !== "") {
        body.sortOrder = Number(sortTrim);
      }
      if (editingPlan) {
        await apiPut(`/pricing/plans/${editingPlan.id}`, body);
      } else {
        await apiPostScoped("/pricing/plans", { ...body, slug: planForm.slug }, app.id);
      }
      setPlanModal(false);
      await load();
    } catch (err) {
      showApiError(err);
    } finally {
      setSaving(false);
    }
  }

  async function togglePlan(p: Plan) {
    try {
      await apiPut(`/pricing/plans/${p.id}`, { isActive: !p.isActive });
      await load();
    } catch (err) {
      showApiError(err);
    }
  }

  async function deletePlan() {
    if (!deleteTarget) return;
    try {
      await apiDelete(`/pricing/plans/${deleteTarget.id}`);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      showApiError(err);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">定价管理</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            配置定价方案与页文案；下方预览区与 Web 站点 `/pricing` 版式一致，便于对照调整。
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn btn-secondary btn-sm gap-2"
            onClick={() => setShowPreview(!showPreview)}
          >
            <Eye className="h-3.5 w-3.5" /> {showPreview ? "隐藏" : "显示"} 预览
          </button>
        </div>
      </div>

      <SectionCard
        title="站点定价页文案"
        tips="与 web 站定价页顶区、按次付费区块一致；保存后写入应用 pricing_page。"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="营销标签（顶部胶囊）">
            <input
              className="input"
              value={pageCopy.marketingPill}
              onChange={(e) => setPageCopy({ ...pageCopy, marketingPill: e.target.value })}
            />
          </FormField>
          <FormField label="标题前半">
            <input
              className="input"
              value={pageCopy.headingPrefix}
              onChange={(e) => setPageCopy({ ...pageCopy, headingPrefix: e.target.value })}
            />
          </FormField>
          <FormField label="标题高亮词（渐变）">
            <input
              className="input"
              value={pageCopy.headingAccent}
              onChange={(e) => setPageCopy({ ...pageCopy, headingAccent: e.target.value })}
            />
          </FormField>
          <FormField label="副标题">
            <textarea
              className="input"
              rows={2}
              value={pageCopy.subheading}
              onChange={(e) => setPageCopy({ ...pageCopy, subheading: e.target.value })}
            />
          </FormField>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">按次付费（Pay-as-you-go）</p>
        <div className="mt-2 grid gap-4 sm:grid-cols-2">
          <FormField label="区块标题">
            <input
              className="input"
              value={pageCopy.payAsYouGoTitle}
              onChange={(e) => setPageCopy({ ...pageCopy, payAsYouGoTitle: e.target.value })}
            />
          </FormField>
          <FormField label="按钮文案">
            <input
              className="input"
              value={pageCopy.payAsYouGoCta}
              onChange={(e) => setPageCopy({ ...pageCopy, payAsYouGoCta: e.target.value })}
            />
          </FormField>
          <FormField label="说明前半（价前）">
            <input
              className="input"
              value={pageCopy.payAsYouGoLead}
              onChange={(e) => setPageCopy({ ...pageCopy, payAsYouGoLead: e.target.value })}
            />
          </FormField>
          <FormField label="价高亮（粗体）">
            <input
              className="input"
              value={pageCopy.payAsYouGoPrice}
              onChange={(e) => setPageCopy({ ...pageCopy, payAsYouGoPrice: e.target.value })}
            />
          </FormField>
          <FormField label="说明后半" hint="接在价格粗体之后">
            <input
              className="input"
              value={pageCopy.payAsYouGoTrail}
              onChange={(e) => setPageCopy({ ...pageCopy, payAsYouGoTrail: e.target.value })}
            />
          </FormField>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => void handleSavePageCopy()}
            disabled={saving}
          >
            {saving ? "保存中…" : "保存页文案"}
          </button>
        </div>
      </SectionCard>

      {showPreview ? (
        <SectionCard title="站点效果预览" tips="与 web 站 `/pricing` 卡片与排版对齐（4 列栅格、强调卡、勾选列表样式）">
          <PricingPreview plans={plans} pricingPage={pageCopy} />
        </SectionCard>
      ) : null}

      <SectionCard title="定价方案" tips="订阅与一次性方案；列表按展示序号升序，便于调整前台顺序。">
        <div className="mb-4 flex justify-end">
          <button type="button" className="btn btn-primary btn-sm gap-2" onClick={openCreatePlan}>
            <Plus className="h-3.5 w-3.5" /> 新建方案
          </button>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th className="w-20">序号</th>
                <th>名称</th>
                <th>价格</th>
                <th>周期</th>
                <th>展示位</th>
                <th>积分</th>
                <th>启用</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {plans.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center text-muted-foreground">
                    暂无方案
                  </td>
                </tr>
              ) : (
                plans.map((p) => (
                  <tr key={p.id}>
                    <td className="text-muted-foreground tabular-nums">{p.sortOrder ?? 0}</td>
                    <td className="font-medium">{p.name}</td>
                    <td>${p.price}</td>
                    <td>
                      <span className="badge">{billingIntervalLabel[p.billingInterval] ?? p.billingInterval}</span>
                    </td>
                    <td className="text-xs text-muted-foreground">
                      {parseDisplaySlots(p.metadata, p.billingInterval)
                        .map((s) => displaySlotLabel[s])
                        .join("、")}
                    </td>
                    <td>{p.creditsPerCycle}</td>
                    <td>
                      <span className={`badge ${p.isActive ? "badge-success" : "badge-warn"}`}>
                        {p.isActive ? "是" : "否"}
                      </span>
                    </td>
                    <td>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => openEditPlan(p)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => togglePlan(p)}
                        >
                          <Power className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm text-red-400"
                          onClick={() => setDeleteTarget(p)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <Modal
        open={planModal}
        onClose={() => setPlanModal(false)}
        title={editingPlan ? `编辑：${editingPlan.name}` : "新建方案"}
      >
        <div className="space-y-4">
          <FormField
            label="展示序号"
            hint={editingPlan ? "数字越小越靠前" : "留空则自动排在已有方案之后"}
          >
            <input
              type="number"
              min={0}
              step={1}
              className="input"
              value={planForm.sortOrder}
              onChange={(e) => setPlanForm({ ...planForm, sortOrder: e.target.value })}
              placeholder={editingPlan ? undefined : "自动"}
            />
          </FormField>
          <FormField label="名称">
            <input
              className="input"
              value={planForm.name}
              onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })}
              placeholder="专业版"
            />
          </FormField>
          {!editingPlan ? (
            <FormField label="标识">
              <input
                className="input"
                value={planForm.slug}
                onChange={(e) => setPlanForm({ ...planForm, slug: e.target.value })}
                placeholder="pro"
              />
            </FormField>
          ) : null}
          <div className="grid grid-cols-2 gap-4">
            <FormField label="价格">
              <input
                type="number"
                min="0"
                step="0.01"
                className="input"
                value={planForm.price}
                onChange={(e) => setPlanForm({ ...planForm, price: e.target.value })}
              />
            </FormField>
            <FormField label="货币">
              <input
                className="input"
                value={planForm.currency}
                onChange={(e) => setPlanForm({ ...planForm, currency: e.target.value })}
              />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="计费周期">
              <select
                className="input"
                value={planForm.billingInterval}
                onChange={(e) => {
                  const billingInterval = e.target.value;
                  if (!editingPlan) {
                    const flags = slotsToFormFlags(defaultDisplaySlots(billingInterval));
                    setPlanForm({ ...planForm, billingInterval, ...flags });
                  } else {
                    setPlanForm({ ...planForm, billingInterval });
                  }
                }}
              >
                {intervals.map((i) => (
                  <option key={i.value} value={i.value}>
                    {i.label}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="每周期积分">
              <input
                type="number"
                min="0"
                className="input"
                value={planForm.creditsPerCycle}
                onChange={(e) => setPlanForm({ ...planForm, creditsPerCycle: e.target.value })}
              />
            </FormField>
          </div>
          <FormField label="描述">
            <textarea
              className="input"
              rows={2}
              value={planForm.description}
              onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })}
            />
          </FormField>
          <FormField label="功能点" hint="每行一条">
            <textarea
              className="input"
              rows={4}
              value={planForm.features}
              onChange={(e) => setPlanForm({ ...planForm, features: e.target.value })}
              placeholder={"HD quality\nBatch processing\nAPI access"}
            />
          </FormField>

          <FormField
            label="支付链接"
            hint="第三方支付页直链，例如 Gumroad 产品 URL；前端定价卡片可直接跳转购买，Gumroad Webhook 据此匹配方案发放积分"
          >
            <input
              className="input"
              value={planForm.paymentLink}
              onChange={(e) => setPlanForm({ ...planForm, paymentLink: e.target.value })}
              placeholder="https://username.gumroad.com/l/abcde"
            />
          </FormField>

          <FormField
            label="展示位"
            hint="产品列表=订阅卡片区；快捷入口=订阅区下方按量/快捷购买区。未勾选任一项时保存将按计费周期写入默认展示位。"
          >
            <div className="flex flex-wrap gap-4">
              {DISPLAY_SLOTS.map((slot) => {
                const checked =
                  slot.value === "product_list"
                    ? planForm.displayProductList
                    : planForm.displayQuickEntry;
                return (
                  <label
                    key={slot.value}
                    className="flex cursor-pointer items-center gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const on = e.target.checked;
                        if (slot.value === "product_list") {
                          setPlanForm({ ...planForm, displayProductList: on });
                        } else {
                          setPlanForm({ ...planForm, displayQuickEntry: on });
                        }
                      }}
                      className="rounded border-border"
                    />
                    {slot.label}
                  </label>
                );
              })}
            </div>
          </FormField>

          <div className="border-t border-border pt-4">
            <p className="mb-3 text-sm font-medium text-foreground">Web 端卡片展示</p>
            <Tips className="mb-3">
              与站点定价卡一致：高亮边框、角标、次行文案、按钮。留空文案则按价格/额度自动推算；未配置链接且启用按钮时，站点可走代收下单。
            </Tips>
            <label className="mb-3 flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={planForm.highlight}
                onChange={(e) => setPlanForm({ ...planForm, highlight: e.target.checked })}
                className="rounded border-border"
              />
              高亮方案（Most Popular 样式）
            </label>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="角标文案" hint="如 Most Popular">
                <input
                  className="input"
                  value={planForm.badge}
                  onChange={(e) => setPlanForm({ ...planForm, badge: e.target.value })}
                />
              </FormField>
              <FormField label="额度行" hint="默认：N HD credits">
                <input
                  className="input"
                  value={planForm.creditsLine}
                  onChange={(e) => setPlanForm({ ...planForm, creditsLine: e.target.value })}
                />
              </FormField>
              <FormField label="单价行" hint="默认：~/image">
                <input
                  className="input"
                  value={planForm.perImageLine}
                  onChange={(e) => setPlanForm({ ...planForm, perImageLine: e.target.value })}
                />
              </FormField>
              <FormField label="按钮文案" hint="留空则站点不显示按钮">
                <input
                  className="input"
                  value={planForm.ctaLabel}
                  onChange={(e) => setPlanForm({ ...planForm, ctaLabel: e.target.value })}
                  placeholder="Get Started"
                />
              </FormField>
              <FormField
                label="按钮链接"
                hint="站内路径如 /pricing；站外 https:// 开头：需登录后新标签页打开，并自动追加 user_id=用户UUID"
              >
                <input
                  className="input"
                  value={planForm.ctaHref}
                  onChange={(e) => setPlanForm({ ...planForm, ctaHref: e.target.value })}
                  placeholder="/pricing 或 https://..."
                />
              </FormField>
            </div>
            <label className="mb-3 flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={planForm.ctaEnabled}
                onChange={(e) => setPlanForm({ ...planForm, ctaEnabled: e.target.checked })}
                className="rounded border-border"
              />
              启用按钮（关闭后站点显示灰色不可点）
            </label>

            <div>
              <p className="mb-2 text-sm text-foreground">方案图标</p>
              <Tips className="mb-3">
                显示在标题左侧；可选常用会员风格图标，或与「高亮方案」搭配使用。
              </Tips>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                    planForm.planIconPreset === ""
                      ? "border-violet-500 bg-violet-500/10 text-foreground"
                      : "border-border text-muted-foreground hover:border-violet-500/40"
                  }`}
                  onClick={() => setPlanForm({ ...planForm, planIconPreset: "" })}
                >
                  无
                </button>
                {PLAN_ICON_PRESETS.map((p) => {
                  const active = planForm.planIconPreset === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      title={p.label}
                      className={`flex flex-col items-center gap-1.5 rounded-lg border px-3 py-2 transition-colors ${
                        active
                          ? "border-violet-500 bg-violet-500/10"
                          : "border-border hover:border-violet-500/40"
                      }`}
                      onClick={() => setPlanForm({ ...planForm, planIconPreset: p.id })}
                    >
                      <PlanPresetIcon presetId={p.id} size="sm" />
                      <span className="text-[10px] text-muted-foreground">{p.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPlanModal(false)}>
            取消
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => void handlePlanSave()}
            disabled={saving || !planForm.name}
          >
            {saving ? "保存中…" : editingPlan ? "更新" : "创建"}
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={deletePlan}
        title="删除方案"
        message={`确定删除「${deleteTarget?.name}」？此操作不可恢复。`}
        confirmLabel="删除"
        danger
      />
    </div>
  );
}
