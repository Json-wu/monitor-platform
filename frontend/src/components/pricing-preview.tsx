"use client";

import { useState } from "react";
import { PlanPresetIcon } from "@/lib/plan-icon-presets";

/**
 * Visual parity with web/src/app/pricing/page.tsx (cards + header + pay-as-you-go).
 * Uses web color tokens via Tailwind arbitrary values where the admin theme differs.
 */

const WEB = {
  accent: "#6d28d9",
  accentLight: "#8b5cf6",
  success: "#22c55e",
} as const;

export type PricingPageCopy = {
  marketingPill?: string;
  headingPrefix?: string;
  headingAccent?: string;
  subheading?: string;
  payAsYouGoTitle?: string;
  payAsYouGoLead?: string;
  payAsYouGoPrice?: string;
  payAsYouGoTrail?: string;
  payAsYouGoCta?: string;
};

export const DEFAULT_PRICING_PAGE: Required<PricingPageCopy> = {
  marketingPill: "50% cheaper than remove.bg",
  headingPrefix: "Simple, Transparent",
  headingAccent: "Pricing",
  subheading:
    "Enterprise-grade AI background removal at half the price. Start free, scale as you grow.",
  payAsYouGoTitle: "Pay-as-you-go",
  payAsYouGoLead: "Need just a few images? Buy credits anytime at",
  payAsYouGoPrice: "$0.10 per image",
  payAsYouGoTrail: ". Credits never expire.",
  payAsYouGoCta: "Buy Credits",
};

type PlanMeta = {
  highlight?: boolean;
  badge?: string;
  creditsLine?: string;
  perImageLine?: string;
  ctaLabel?: string;
  ctaHref?: string;
  /** crown | sparkles | gem | award */
  planIconPreset?: string;
};

export type PricingPlanRow = {
  id: string;
  name: string;
  price: number;
  currency: string;
  billingInterval: string;
  creditsPerCycle: number;
  features: string[] | null;
  description: string | null;
  isActive: boolean;
  sortOrder?: number;
  metadata?: unknown;
};

function parseMeta(metadata: unknown): PlanMeta {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};
  const m = metadata as Record<string, unknown>;
  return {
    highlight: m.highlight === true,
    badge: typeof m.badge === "string" ? m.badge : undefined,
    creditsLine: typeof m.creditsLine === "string" ? m.creditsLine : undefined,
    perImageLine: typeof m.perImageLine === "string" ? m.perImageLine : undefined,
    ctaLabel: typeof m.ctaLabel === "string" ? m.ctaLabel : undefined,
    ctaHref: typeof m.ctaHref === "string" ? m.ctaHref : undefined,
    planIconPreset: typeof m.planIconPreset === "string" ? m.planIconPreset : undefined,
  };
}

/** 与金额同一行展示，使用完整单词：/month、/year */
function periodSuffix(billingInterval: string): string {
  switch (billingInterval) {
    case "monthly":
      return "/month";
    case "yearly":
      return "/year";
    case "quarterly":
      return "/quarter";
    case "one_time":
      return "";
    default:
      return billingInterval ? `/${billingInterval}` : "";
  }
}

function formatMoney(amount: number, currency: string): string {
  const c = (currency || "usd").toUpperCase();
  const sym = c === "USD" ? "$" : `${c} `;
  const n = Number(amount);
  const num = Number.isInteger(n) ? String(n) : n.toFixed(2);
  return `${sym}${num}`;
}

/** 与 web/src/lib/pricing-page.ts `formatPerImageUnitPrice` 保持同步 */
function formatPerImageUnitPrice(
  packPrice: number,
  creditsPerCycle: number,
  currency: string,
): string | null {
  if (!Number.isFinite(packPrice) || !Number.isFinite(creditsPerCycle) || creditsPerCycle <= 0) {
    return null;
  }
  const unit = packPrice / creditsPerCycle;
  if (!Number.isFinite(unit) || unit < 0) return null;
  const c = (currency || "usd").toUpperCase();
  const sym = c === "USD" ? "$" : `${c} `;
  const hasFrac = Math.abs(unit % 1) > 1e-9;
  const num = hasFrac ? (unit < 0.1 ? unit.toFixed(3) : unit.toFixed(2)) : String(Math.trunc(unit));
  return `${sym}${num}`;
}

function formatPayAsYouGoPerImageLabel(plans: PricingPlanRow[]): string | null {
  const payg = [...plans]
    .filter(
      (p) =>
        p.billingInterval === "one_time" &&
        Number(p.price) > 0 &&
        Number(p.creditsPerCycle) > 0,
    )
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const p = payg[0];
  if (!p) return null;
  const unitStr = formatPerImageUnitPrice(Number(p.price), p.creditsPerCycle, p.currency);
  if (!unitStr) return null;
  return `${unitStr} per image`;
}

function defaultPerImage(price: number, credits: number): string {
  if (!credits || credits <= 0) return "—";
  const v = price / credits;
  return `~$${v < 0.1 ? v.toFixed(3) : v.toFixed(2)}`;
}

function defaultCreditsLine(creditsPerCycle: number): string | null {
  if (!creditsPerCycle || creditsPerCycle <= 0) return null;
  return `${creditsPerCycle} HD credits`;
}

function defaultPerImageLine(price: number, credits: number): string | null {
  if (!credits || credits <= 0) return null;
  const p = defaultPerImage(price, credits);
  if (p === "—") return null;
  return `${p}/image`;
}

/** Strip mistaken trailing " 0" on free-tier copy (e.g. "One free quota per day 0"). */
function sanitizeFreeTierCreditsCopy(text: string): string {
  return text.replace(/\s+0\s*$/u, "").trim();
}

function CheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mt-0.5 shrink-0"
      style={{ color: WEB.success }}
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function mergePricingPage(
  settings: unknown,
): Required<PricingPageCopy> {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return { ...DEFAULT_PRICING_PAGE };
  }
  const s = settings as Record<string, unknown>;
  const raw = s.pricingPage;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_PRICING_PAGE };
  }
  const p = raw as Record<string, unknown>;
  return {
    marketingPill:
      typeof p.marketingPill === "string" && p.marketingPill
        ? p.marketingPill
        : DEFAULT_PRICING_PAGE.marketingPill,
    headingPrefix:
      typeof p.headingPrefix === "string" && p.headingPrefix
        ? p.headingPrefix
        : DEFAULT_PRICING_PAGE.headingPrefix,
    headingAccent:
      typeof p.headingAccent === "string" && p.headingAccent
        ? p.headingAccent
        : DEFAULT_PRICING_PAGE.headingAccent,
    subheading:
      typeof p.subheading === "string" && p.subheading
        ? p.subheading
        : DEFAULT_PRICING_PAGE.subheading,
    payAsYouGoTitle:
      typeof p.payAsYouGoTitle === "string" && p.payAsYouGoTitle
        ? p.payAsYouGoTitle
        : DEFAULT_PRICING_PAGE.payAsYouGoTitle,
    payAsYouGoLead:
      typeof p.payAsYouGoLead === "string" && p.payAsYouGoLead
        ? p.payAsYouGoLead
        : DEFAULT_PRICING_PAGE.payAsYouGoLead,
    payAsYouGoPrice:
      typeof p.payAsYouGoPrice === "string" && p.payAsYouGoPrice
        ? p.payAsYouGoPrice
        : DEFAULT_PRICING_PAGE.payAsYouGoPrice,
    payAsYouGoTrail:
      typeof p.payAsYouGoTrail === "string" && p.payAsYouGoTrail
        ? p.payAsYouGoTrail
        : DEFAULT_PRICING_PAGE.payAsYouGoTrail,
    payAsYouGoCta:
      typeof p.payAsYouGoCta === "string" && p.payAsYouGoCta
        ? p.payAsYouGoCta
        : DEFAULT_PRICING_PAGE.payAsYouGoCta,
  };
}

type Props = {
  plans: PricingPlanRow[];
  pricingPage?: PricingPageCopy;
};

export function PricingPreview({ plans, pricingPage }: Props) {
  const page = { ...DEFAULT_PRICING_PAGE, ...pricingPage };
  const active = plans.filter((p) => p.isActive).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const gridPlans = active.filter((p) => p.billingInterval !== "one_time");
  const paygPlans = active.filter(
    (p) => p.billingInterval === "one_time" && Number(p.price) > 0,
  );
  const payAsYouGoPriceDisplay =
    formatPayAsYouGoPerImageLabel(paygPlans) ?? page.payAsYouGoPrice;
  const [paygPreviewOpen, setPaygPreviewOpen] = useState(false);

  if (active.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        暂无启用中的方案；请新增方案或启用已有方案后即可预览站点效果。
      </p>
    );
  }

  return (
    <div className="pricing-preview-web rounded-xl border border-border bg-background px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <div
            className="mb-4 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm"
            style={{
              borderColor: `${WEB.success}4d`,
              backgroundColor: `${WEB.success}0d`,
            }}
          >
            <span className="font-medium" style={{ color: WEB.success }}>
              {page.marketingPill}
            </span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            {page.headingPrefix}{" "}
            <span className="gradient-text">{page.headingAccent}</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">{page.subheading}</p>
        </div>

        {gridPlans.length > 0 ? (
        <div className="mt-16 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {gridPlans.map((plan) => {
            const meta = parseMeta(plan.metadata);
            const highlight = meta.highlight === true;
            const priceNum = Number(plan.price);
            const isFree = !Number.isNaN(priceNum) && priceNum === 0;
            const priceStr = formatMoney(priceNum, plan.currency);
            const period = periodSuffix(plan.billingInterval);
            let creditsLine: string | null =
              meta.creditsLine?.trim() ||
              defaultCreditsLine(plan.creditsPerCycle);
            if (creditsLine && isFree) {
              const cleaned = sanitizeFreeTierCreditsCopy(creditsLine);
              creditsLine = cleaned.length ? cleaned : null;
            }
            const perLine =
              meta.perImageLine?.trim() ||
              (!isFree
                ? defaultPerImageLine(Number(plan.price), plan.creditsPerCycle)
                : null);
            const ctaLabel = meta.ctaLabel?.trim() ?? "";
            const badge = meta.badge?.trim();

            return (
              <div
                key={plan.id}
                className={`relative flex flex-col rounded-2xl border p-6 transition-all hover:opacity-[0.98] ${
                  highlight
                    ? "glow-border glow"
                    : "border-border bg-card"
                }`}
                style={
                  highlight
                    ? { borderColor: `${WEB.accent}99` }
                    : undefined
                }
              >
                {badge ? (
                  <span
                    className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-semibold text-white"
                    style={{ backgroundColor: WEB.accent }}
                  >
                    {badge}
                  </span>
                ) : null}

                <div className="flex items-start gap-2">
                  <PlanPresetIcon presetId={meta.planIconPreset} />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-lg font-semibold text-foreground">{plan.name}</h3>
                    {plan.description ? (
                      <p className="mt-1 text-xs text-muted-foreground">{plan.description}</p>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4">
                  {isFree ? (
                    <span className="text-4xl font-bold text-foreground">free</span>
                  ) : (
                    <>
                      <span className="text-4xl font-bold text-foreground">{priceStr}</span>
                      <span className="text-muted-foreground">{period}</span>
                    </>
                  )}
                </div>

                {creditsLine || perLine ? (
                  <div className="mt-2 flex flex-col gap-1 text-sm text-muted-foreground">
                    {creditsLine ? <span>{creditsLine}</span> : null}
                    {perLine ? <span>{perLine}</span> : null}
                  </div>
                ) : null}

                <hr className="my-6 border-border" />

                <ul className="flex-1 space-y-3">
                  {(Array.isArray(plan.features) ? plan.features : []).map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <CheckIcon />
                      <span className="text-muted-foreground">{f}</span>
                    </li>
                  ))}
                </ul>

                {ctaLabel ? (
                  <span
                    className={`mt-6 block rounded-lg py-2.5 text-center text-sm font-semibold transition-colors ${
                      highlight
                        ? "text-white"
                        : "border border-border text-muted-foreground"
                    }`}
                    style={
                      highlight
                        ? { backgroundColor: WEB.accent }
                        : undefined
                    }
                  >
                    {ctaLabel}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
        ) : gridPlans.length === 0 && paygPlans.length > 0 ? (
          <p className="mt-16 text-center text-sm text-muted-foreground">
            当前仅有「一次性」按量方案时，订阅类卡片区域为空；请点击下方「{page.payAsYouGoCta}」预览按量购买。
          </p>
        ) : null}

        <div className="mt-12 rounded-2xl border border-border bg-card p-8 text-center">
          <h3 className="text-xl font-bold text-foreground">{page.payAsYouGoTitle}</h3>
          <p className="mt-2 text-muted-foreground">
            {page.payAsYouGoLead}{" "}
            <span className="font-semibold text-foreground">{payAsYouGoPriceDisplay}</span>
            {page.payAsYouGoTrail}
          </p>
          <button
            type="button"
            aria-expanded={paygPreviewOpen}
            onClick={() => setPaygPreviewOpen((o) => !o)}
            className="mt-6 rounded-lg border px-8 py-2.5 text-sm font-semibold transition-colors hover:opacity-90"
            style={{
              borderColor: WEB.accent,
              color: WEB.accentLight,
              backgroundColor: paygPreviewOpen ? `${WEB.accent}14` : undefined,
            }}
          >
            {page.payAsYouGoCta}
          </button>

          {paygPreviewOpen ? (
            <div className="mt-6 border-t border-border pt-6 text-left">
              {paygPlans.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground">
                  尚未配置「一次性」计费且价格大于 0 的按量方案；站点不会在用户操作前展示具体商品明细。
                </p>
              ) : (
                <div className="mx-auto max-w-lg space-y-4">
                  <p className="text-center text-xs text-muted-foreground">
                    与营销站一致：用户点击「{page.payAsYouGoCta}」后填写数量与邮箱并下单（以下为方案摘要预览）。
                  </p>
                  {paygPlans.map((plan) => {
                    const unit = Number(plan.price);
                    const demoQty = 2;
                    const total = Number((unit * demoQty).toFixed(2));
                    const credits = plan.creditsPerCycle * demoQty;
                    return (
                      <div
                        key={plan.id}
                        className="rounded-lg border border-border bg-background/80 p-4 text-sm"
                      >
                        <div className="font-semibold text-foreground">{plan.name}</div>
                        <div className="mt-1 text-muted-foreground">
                          {formatMoney(unit, plan.currency)} / 份 · 每份{" "}
                          {plan.creditsPerCycle} credits
                        </div>
                        <div className="mt-3 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                          示例：数量 {demoQty} → 支付{" "}
                          <span className="font-medium text-foreground">
                            {formatMoney(total, plan.currency)}
                          </span>
                          ，到账{" "}
                          <span className="font-medium text-foreground">{credits}</span>{" "}
                          credits
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
