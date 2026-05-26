/**
 * 管理后台积分流水「原因」展示（中文）。
 * 机器码与 backend/src/modules/credit/credit-reason-codes.ts 对齐；另含历史英文文案与支付回调文案。
 */
const ZH: Record<string, string> = {
  // ── CreditReasonCode：ClearBG 抠图 ──
  "clearbg.api.deduct": "ClearBG API 抠图消费",
  "clearbg.api.refund": "ClearBG API 上游失败退款",

  // ── CreditReasonCode：可灵生图 ──
  "kling_image.api.deduct": "可灵生图 API 消费",
  "kling_image.api.refund": "可灵生图 API 上游失败退款",

  // ── CreditReasonCode：DDColor 上色 ──
  "ddcolor.api.deduct": "上色 API 消费（DDColor）",
  "ddcolor.api.refund": "上色 API 上游失败退款",

  // ── CreditReasonCode：上色附加划痕修复 ──
  "colorize.scratch_repair.deduct": "上色附加划痕修复消费",
  "colorize.scratch_repair.refund": "上色划痕修复失败退款",

  // ── CreditReasonCode：超分 / 高清（unblur、face_remaster、inpainting 等）──
  "upscale.api.deduct": "图片超分/高清 API 消费",
  "upscale.api.refund": "图片超分 API 上游失败退款",

  // ── CreditReasonCode：房间装修图 ──
  "room_decoration.api.deduct": "房间装修图 API 消费",
  "room_decoration.api.refund": "房间装修图 API 上游失败退款",

  // ── CreditReasonCode：定时任务 ──
  "scheduler.daily_promo_reset": "每日免费积分重置（UTC 零点）",
  "scheduler.monthly_sub_expire": "订阅月度积分过期（账单周期）",

  // ── 支付回调（LinkMePay / Gumroad）──
  "LinkMePay pay-as-you-go purchase": "按量积分购买（LinkMePay）",
  "LinkMePay subscription purchase": "订阅购买（LinkMePay）",
  "Gumroad pay-as-you-go purchase": "按量积分购买（Gumroad）",
  "Gumroad subscription purchase": "订阅购买（Gumroad）",

  // ── 历史英文 / 中文文案（旧数据兼容）──
  "ClearBG API background removal": "ClearBG API 抠图消费",
  "ClearBG upstream failure refund": "ClearBG API 上游失败退款",
  "ClearBG API 抠图消费": "ClearBG API 抠图消费",
};

export function creditTransactionReasonZh(reason: string): string {
  const key = reason.trim();
  return ZH[key] ?? reason;
}
