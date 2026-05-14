/**
 * 管理后台积分流水「原因」展示（中文）。
 * 与后端 `credit_transaction.reason` 机器码及历史文案对齐。
 */
const ZH: Record<string, string> = {
  "clearbg.api.deduct": "ClearBG API 抠图消费",
  "clearbg.api.refund": "ClearBG API 上游失败退款",
  "kling_image.api.deduct": "可灵生图 API 消费",
  "kling_image.api.refund": "可灵生图 API 上游失败退款",
  "ClearBG API background removal": "ClearBG API 抠图消费",
  "ClearBG upstream failure refund": "ClearBG API 上游失败退款",
  "ClearBG API 抠图消费": "ClearBG API 抠图消费",
  "LinkMePay pay-as-you-go purchase": "按量积分购买（LinkMePay）",
  "LinkMePay subscription purchase": "订阅购买（LinkMePay）",
  "scheduler.daily_promo_reset": "每日免费积分重置（UTC 零点）",
  "scheduler.monthly_sub_expire": "订阅月度积分过期（账单周期）",
};

export function creditTransactionReasonZh(reason: string): string {
  const key = reason.trim();
  return ZH[key] ?? reason;
}
