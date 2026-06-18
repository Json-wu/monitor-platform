import type { SubStatus, PrismaClient } from '@prisma/client';
import { resolveAinewsAppId } from './ainews-end-user.util';
import {
  effectiveTierFromSubscription,
  type EffectiveTier,
  type PaidPlan,
} from './ainews-tier.util';

export type AinewsSubscriptionView = {
  plan: PaidPlan | string;
  status: string;
  lastPaidAt: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  recurrence: string | null;
};

export function paidPlanFromPricingSlug(slug: string): PaidPlan | null {
  const s = slug.trim().toLowerCase();
  if (s.includes('unlimited')) return 'unlimited';
  if (s.includes('pro')) return 'pro';
  return null;
}

export function mapPluginStatusToSubStatus(
  status: string,
  deactivate = false,
): SubStatus {
  if (deactivate || status === 'cancelled' || status === 'refunded') {
    return 'cancelled';
  }
  if (status === 'expired') return 'expired';
  if (status === 'past_due') return 'past_due';
  return 'active';
}

export function subStatusToPluginStatus(status: SubStatus): string {
  return status === 'active' ? 'active' : 'cancelled';
}

export async function findPricingPlanForPaidPlan(
  prisma: PrismaClient,
  appId: string,
  plan: PaidPlan,
) {
  const bySlug = await prisma.pricingPlan.findFirst({
    where: { appId, isActive: true, slug: plan },
  });
  if (bySlug) return bySlug;

  const needle =
    plan === 'pro' ? 'industry-ai-news-pro' : 'industry-ai-news-unlimited';
  return prisma.pricingPlan.findFirst({
    where: {
      appId,
      isActive: true,
      OR: [
        { slug: { contains: plan, mode: 'insensitive' } },
        { paymentLink: { contains: needle, mode: 'insensitive' } },
      ],
    },
    orderBy: { sortOrder: 'asc' },
  });
}

export async function loadAinewsPlatformSubscription(
  prisma: PrismaClient,
  endUserId: string,
) {
  const appId = await resolveAinewsAppId(prisma);
  return prisma.subscription.findUnique({
    where: { appId_userId: { appId, userId: endUserId } },
    include: { plan: { select: { slug: true, name: true } } },
  });
}

export function tierFromPlatformSubscription(
  sub: {
    status: SubStatus;
    currentPeriodEnd: Date;
    plan: { slug: string };
  } | null,
): EffectiveTier {
  if (!sub) return 'free';
  const plan = paidPlanFromPricingSlug(sub.plan.slug);
  const status = subStatusToPluginStatus(sub.status);
  return effectiveTierFromSubscription(plan, status, sub.currentPeriodEnd);
}

export function toAinewsSubscriptionView(
  sub: {
    status: SubStatus;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    plan: { slug: string };
  } | null,
): AinewsSubscriptionView | null {
  if (!sub) return null;
  const plan = paidPlanFromPricingSlug(sub.plan.slug) ?? sub.plan.slug;
  return {
    plan,
    status: subStatusToPluginStatus(sub.status),
    lastPaidAt: sub.currentPeriodStart.toISOString(),
    currentPeriodStart: sub.currentPeriodStart.toISOString(),
    currentPeriodEnd: sub.currentPeriodEnd.toISOString(),
    recurrence: null,
  };
}

export async function upsertAinewsPlatformSubscription(
  prisma: PrismaClient,
  input: {
    endUserId: string;
    plan: PaidPlan;
    status: string;
    deactivate?: boolean;
    gatewaySubId?: string | null;
    currentPeriodStart?: Date | null;
    currentPeriodEnd?: Date | null;
  },
): Promise<boolean> {
  const appId = await resolveAinewsAppId(prisma);
  const pricingPlan = await findPricingPlanForPaidPlan(
    prisma,
    appId,
    input.plan,
  );
  if (!pricingPlan) return false;

  const deactivate = input.deactivate ?? false;
  const subStatus = mapPluginStatusToSubStatus(input.status, deactivate);
  const now = new Date();
  const periodStart = input.currentPeriodStart ?? now;
  const periodEnd =
    input.currentPeriodEnd ??
    new Date(periodStart.getTime() + 30 * 24 * 60 * 60 * 1000);

  await prisma.subscription.upsert({
    where: { appId_userId: { appId, userId: input.endUserId } },
    create: {
      appId,
      userId: input.endUserId,
      planId: pricingPlan.id,
      status: subStatus,
      gatewaySubId: input.gatewaySubId ?? undefined,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAt: deactivate ? (input.currentPeriodEnd ?? now) : undefined,
    },
    update: {
      planId: pricingPlan.id,
      status: subStatus,
      gatewaySubId: input.gatewaySubId ?? undefined,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAt: deactivate ? (input.currentPeriodEnd ?? now) : null,
      updatedAt: now,
    },
  });
  return true;
}

export async function findUnlimitedSubscriberUserIds(
  prisma: PrismaClient,
): Promise<string[]> {
  const appId = await resolveAinewsAppId(prisma);
  const plans = await prisma.pricingPlan.findMany({
    where: {
      appId,
      isActive: true,
      OR: [
        { slug: { contains: 'unlimited', mode: 'insensitive' } },
        {
          paymentLink: {
            contains: 'industry-ai-news-unlimited',
            mode: 'insensitive',
          },
        },
      ],
    },
    select: { id: true },
  });
  if (plans.length === 0) return [];

  const subs = await prisma.subscription.findMany({
    where: {
      appId,
      status: 'active',
      planId: { in: plans.map((p) => p.id) },
    },
    select: { userId: true },
  });
  return subs.map((s) => s.userId);
}
