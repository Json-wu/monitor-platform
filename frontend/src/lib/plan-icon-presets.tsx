"use client";

import { Award, Crown, Gem, Sparkles, type LucideIcon } from "lucide-react";

/** 与 pricing_plan.metadata.planIconPreset 对应 */
export const PLAN_ICON_PRESET_IDS = ["crown", "sparkles", "gem", "award"] as const;

export type PlanIconPresetId = (typeof PLAN_ICON_PRESET_IDS)[number];

/** 各预设圆角方形容器的渐变背景（图标本身为白色） */
export const PLAN_ICON_PRESET_GRADIENTS: Record<PlanIconPresetId, string> = {
  crown: "linear-gradient(145deg, #fbbf24 0%, #d97706 55%, #b45309 100%)",
  sparkles: "linear-gradient(145deg, #c4b5fd 0%, #8b5cf6 45%, #5b21b6 100%)",
  gem: "linear-gradient(145deg, #67e8f9 0%, #22d3ee 40%, #1d4ed8 100%)",
  award: "linear-gradient(145deg, #fda4af 0%, #f43f5e 50%, #9f1239 100%)",
};

export const PLAN_ICON_PRESETS: {
  id: PlanIconPresetId;
  label: string;
  Icon: LucideIcon;
}[] = [
  { id: "crown", label: "皇冠", Icon: Crown },
  { id: "sparkles", label: "星光", Icon: Sparkles },
  { id: "gem", label: "宝石", Icon: Gem },
  { id: "award", label: "奖章", Icon: Award },
];

const sizeClasses = {
  sm: { box: "h-8 w-8 rounded-lg", icon: "h-4 w-4" },
  md: { box: "h-10 w-10 rounded-xl", icon: "h-5 w-5" },
} as const;

export function PlanPresetIcon({
  presetId,
  size = "md",
}: {
  presetId?: string | null;
  size?: keyof typeof sizeClasses;
}) {
  if (!presetId) return null;
  const row = PLAN_ICON_PRESETS.find((p) => p.id === presetId);
  if (!row) return null;
  const grad = PLAN_ICON_PRESET_GRADIENTS[row.id as PlanIconPresetId];
  if (!grad) return null;
  const Icon = row.Icon;
  const s = sizeClasses[size];
  return (
    <div
      className={`flex shrink-0 items-center justify-center shadow-sm ring-1 ring-white/15 ${s.box}`}
      style={{ background: grad }}
    >
      <Icon className={`${s.icon} text-white`} strokeWidth={2} aria-hidden />
    </div>
  );
}
