export type DisplaySlot = "product_list" | "quick_entry";

export const DISPLAY_SLOTS: { value: DisplaySlot; label: string }[] = [
  { value: "product_list", label: "产品列表" },
  { value: "quick_entry", label: "快捷入口" },
];

type PlanMetaLike = {
  highlight?: boolean;
  ctaLabel?: string;
  ctaHref?: string;
  displaySlots?: unknown;
  ctaEnabled?: unknown;
};

export function parseMeta(metadata: unknown): PlanMetaLike {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }
  const m = metadata as Record<string, unknown>;
  return {
    highlight: m.highlight === true,
    ctaLabel: typeof m.ctaLabel === "string" ? m.ctaLabel : undefined,
    ctaHref: typeof m.ctaHref === "string" ? m.ctaHref : undefined,
    displaySlots: m.displaySlots,
    ctaEnabled: m.ctaEnabled,
  };
}

export function defaultDisplaySlots(billingInterval: string): DisplaySlot[] {
  return billingInterval === "one_time" ? ["quick_entry"] : ["product_list"];
}

export function parseDisplaySlots(
  metadata: unknown,
  billingInterval: string,
): DisplaySlot[] {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return defaultDisplaySlots(billingInterval);
  }
  const raw = (metadata as Record<string, unknown>).displaySlots;
  if (!Array.isArray(raw)) return defaultDisplaySlots(billingInterval);
  const slots = raw.filter(
    (s): s is DisplaySlot => s === "product_list" || s === "quick_entry",
  );
  return slots.length > 0 ? slots : defaultDisplaySlots(billingInterval);
}

export function planHasDisplaySlot(
  plan: { metadata?: unknown; billingInterval: string },
  slot: DisplaySlot,
): boolean {
  return parseDisplaySlots(plan.metadata, plan.billingInterval).includes(slot);
}

export function filterPlansByDisplaySlot<
  T extends { metadata?: unknown; billingInterval: string },
>(plans: T[], slot: DisplaySlot): T[] {
  return plans.filter((p) => planHasDisplaySlot(p, slot));
}

export function parseCtaEnabled(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return true;
  }
  return (metadata as Record<string, unknown>).ctaEnabled !== false;
}

export function isExternalHref(href: string): boolean {
  return /^https?:\/\//i.test(href.trim());
}
