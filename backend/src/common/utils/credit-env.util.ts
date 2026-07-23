/**
 * 终端用户积分相关环境变量（注册赠送 / 每日 promo）。
 * 非法或未设置时回退到默认值。
 */

function parseNonNegInt(raw: string | undefined, fallback: number): number {
  if (raw == null || raw.trim() === '') return fallback;
  const n = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

/** 新用户注册成功赠送的永久积分（payg），默认 10 */
export function signupBonusCredits(): number {
  return parseNonNegInt(process.env.SIGNUP_BONUS_CREDITS, 10);
}

/** UTC 每日 0 点将 promo 池重置到的目标值，默认 1 */
export function dailyPromoCredits(): number {
  return parseNonNegInt(process.env.DAILY_PROMO_CREDITS, 1);
}
