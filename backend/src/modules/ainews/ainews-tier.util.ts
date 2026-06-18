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
): PaidPlan | null {
  const pid = productId.trim();
  const link = permalink.trim().toLowerCase();
  if (unlimitedId && pid === unlimitedId) return 'unlimited';
  if (proId && pid === proId) return 'pro';
  if (link.includes('industry-ai-news-unlimited')) return 'unlimited';
  if (link.includes('industry-ai-news-pro')) return 'pro';
  return null;
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
