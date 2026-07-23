export type PaidPlan = 'pro' | 'unlimited';
export type EffectiveTier = 'free' | PaidPlan;

export const FREE_FOLLOW_DOMAINS_MAX = 3;
export const PRO_FOLLOW_DOMAINS_MAX = 10;
export const SUMMARY_DAILY_LIMIT_UNLIMITED = 1_000_000;
export const SUMMARY_DAILY_LIMIT_FREE = SUMMARY_DAILY_LIMIT_UNLIMITED;
export const SUMMARY_DAILY_LIMIT_PRO = SUMMARY_DAILY_LIMIT_UNLIMITED;

export type TierLimits = {
  tier: EffectiveTier;
  followDomainsMax: number | null;
  summariesPerDay: number;
  crossDeviceSync: boolean;
  emailDigest: boolean;
};

export function limitsForTier(tier: EffectiveTier): TierLimits {
  if (tier === 'unlimited') {
    return {
      tier,
      followDomainsMax: null,
      summariesPerDay: SUMMARY_DAILY_LIMIT_UNLIMITED,
      crossDeviceSync: true,
      emailDigest: true,
    };
  }
  if (tier === 'pro') {
    return {
      tier,
      followDomainsMax: PRO_FOLLOW_DOMAINS_MAX,
      summariesPerDay: SUMMARY_DAILY_LIMIT_PRO,
      crossDeviceSync: true,
      emailDigest: false,
    };
  }
  return {
    tier: 'free',
    followDomainsMax: FREE_FOLLOW_DOMAINS_MAX,
    summariesPerDay: SUMMARY_DAILY_LIMIT_FREE,
    crossDeviceSync: false,
    emailDigest: false,
  };
}

export function planFromGumroadProduct(
  productId: string,
  permalink: string,
  proId: string,
  unlimitedId: string,
  extraNeedles: string[] = [],
): PaidPlan | null {
  const pid = productId.trim();
  const haystacks = [permalink, ...extraNeedles]
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (unlimitedId && pid === unlimitedId) return 'unlimited';
  if (proId && pid === proId) return 'pro';

  const salePro = (process.env.GUMROAD_SALE_PRODUCT_ID_PRO ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const saleUnl = (process.env.GUMROAD_SALE_PRODUCT_ID_UNLIMITED ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (pid && saleUnl.includes(pid)) return 'unlimited';
  if (pid && salePro.includes(pid)) return 'pro';

  for (const link of haystacks) {
    if (link.includes('industry-ai-news-unlimited')) return 'unlimited';
  }
  for (const link of haystacks) {
    if (link.includes('industry-ai-news-pro')) return 'pro';
  }
  if (unlimitedId) {
    const u = unlimitedId.toLowerCase();
    if (haystacks.some((h) => h.includes(u))) return 'unlimited';
  }
  if (proId) {
    const p = proId.toLowerCase();
    if (haystacks.some((h) => h.includes(p))) return 'pro';
  }
  return null;
}

/** 从多个 Gumroad 字段中解析 Pro / Unlimited（避免 short_product_id 短码挡住完整 permalink） */
export function planFromGumroadFields(
  body: Record<string, string>,
  proId = process.env.GUMROAD_PRODUCT_ID_PRO?.trim() || 'industry-ai-news-pro',
  unlimitedId =
    process.env.GUMROAD_PRODUCT_ID_UNLIMITED?.trim() ||
    'industry-ai-news-unlimited',
): PaidPlan | null {
  const productId = (body.product_id ?? '').trim();
  const needles = [
    body.product_permalink ?? '',
    body.permalink ?? '',
    body.short_product_id ?? '',
    body.product_name ?? '',
    body.url ?? '',
  ];
  return planFromGumroadProduct(
    productId,
    needles.join(' '),
    proId,
    unlimitedId,
    needles,
  );
}

export function effectiveTierFromSubscription(
  plan: string | null | undefined,
  status: string | null | undefined,
  currentPeriodEnd: Date | string | null | undefined = null,
): EffectiveTier {
  if (status !== 'active') return 'free';
  if (currentPeriodEnd) {
    const endMs = Date.parse(String(currentPeriodEnd));
    if (Number.isFinite(endMs) && endMs < Date.now()) return 'free';
  }
  if (plan === 'pro' || plan === 'unlimited') return plan;
  return 'free';
}

export function isDeactivatePing(
  refunded: unknown,
  cancelled: unknown,
  ended: unknown,
): boolean {
  const r = refunded === true || refunded === 'true';
  const c = cancelled === true || cancelled === 'true';
  const e = typeof ended === 'string' && ended.length > 0;
  return r || c || e;
}
