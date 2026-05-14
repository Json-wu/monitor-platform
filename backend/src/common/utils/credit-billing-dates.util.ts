/**
 * 订阅月度积分清零时刻（UTC 当日 00:00）：
 * 支付日期的「次月」、UTC 日历日为「支付日 UTC 日 + 1」（与 JS Date 月份进位一致）。
 */
export function utcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** 首次清零：paidAt 所在 UTC 月的下一月，日为 (paidAt 的 UTC 日 + 1)，时刻 00:00 UTC。 */
export function firstSubscriptionMonthlyExpireUtc(paidAt: Date): Date {
  const y = paidAt.getUTCFullYear();
  const m = paidAt.getUTCMonth();
  const d = paidAt.getUTCDate();
  return new Date(Date.UTC(y, m + 1, d + 1, 0, 0, 0, 0));
}

/** 之后每个账单月同一 UTC 日 00:00（与首次清零日对齐）。 */
export function nextSubscriptionMonthlyExpireUtc(prevExpireUtc: Date): Date {
  const y = prevExpireUtc.getUTCFullYear();
  const m = prevExpireUtc.getUTCMonth();
  const day = prevExpireUtc.getUTCDate();
  return new Date(Date.UTC(y, m + 1, day, 0, 0, 0, 0));
}
