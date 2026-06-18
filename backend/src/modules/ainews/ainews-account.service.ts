import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  limitsForTier,
  type EffectiveTier,
} from './ainews-tier.util';
import {
  isUuid,
  isDeviceGuestUser,
  mergeAinewsGuestIntoEndUser,
  resolveAinewsAppId,
  toAinewsEndUserUpdate,
} from './ainews-end-user.util';
import {
  findDeviceGuest,
  upsertDeviceGuest,
} from './ainews-user-resolve.util';
import {
  loadAinewsPlatformSubscription,
  tierFromPlatformSubscription,
  toAinewsSubscriptionView,
  upsertAinewsPlatformSubscription,
} from './ainews-subscription.util';
import { SEED_PRESET_DOMAINS } from './rss-config';
import type { PaidPlan } from './ainews-tier.util';

export type ResolvedAinewsAccount = {
  tier: EffectiveTier;
  limits: ReturnType<typeof limitsForTier>;
  email: string | null;
  subscription: {
    plan: string;
    status: string;
    lastPaidAt: string | null;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    recurrence: string | null;
  } | null;
};

@Injectable()
export class AinewsAccountService {
  constructor(private readonly prisma: PrismaService) {}

  resolveAnonAccount(): ResolvedAinewsAccount {
    const tier: EffectiveTier = 'free';
    return {
      tier,
      limits: limitsForTier(tier),
      email: null,
      subscription: null,
    };
  }

  async mergePendingForEmail(email: string, endUserId: string): Promise<void> {
    const normalized = email.trim().toLowerCase();
    const pending = await this.prisma.ainewsPendingSubscription.findUnique({
      where: { email: normalized },
    });
    if (!pending) return;

    const plan = pending.plan as PaidPlan;
    if (plan !== 'pro' && plan !== 'unlimited') return;

    await upsertAinewsPlatformSubscription(this.prisma, {
      endUserId,
      plan,
      status: pending.status,
      gatewaySubId: pending.gumroadSubscriptionId,
      currentPeriodStart: pending.currentPeriodStart,
      currentPeriodEnd: pending.currentPeriodEnd,
    });

    await this.prisma.ainewsPendingSubscription.delete({
      where: { email: normalized },
    });
  }

  async resolveForEndUser(
    endUserId: string,
    email: string | null,
  ): Promise<ResolvedAinewsAccount> {
    if (email) {
      await this.mergePendingForEmail(email, endUserId);
    }
    const sub = await loadAinewsPlatformSubscription(this.prisma, endUserId);
    const tier = tierFromPlatformSubscription(sub);
    const view = toAinewsSubscriptionView(sub);
    return {
      tier,
      limits: limitsForTier(tier),
      email,
      subscription: view,
    };
  }

  /**
   * 登录后：按 device_id 找访客并合并到当前邮箱账户；更新 OAuth 用户的 device_id。
   */
  async linkAnonToEndUser(
    endUserId: string,
    email: string | null,
    deviceId: string,
    hintGuestId = '',
  ): Promise<ResolvedAinewsAccount | null> {
    const endUser = await this.prisma.endUser.findUnique({
      where: { id: endUserId },
    });
    if (!endUser) return null;

    const now = new Date();
    const trimmedDeviceId = deviceId.trim();
    const defaultDomains = [...SEED_PRESET_DOMAINS];
    const appId = await resolveAinewsAppId(this.prisma);

    let guest =
      trimmedDeviceId &&
      (await findDeviceGuest(this.prisma, appId, trimmedDeviceId));

    if (
      !guest &&
      isUuid(hintGuestId.trim()) &&
      hintGuestId.trim() !== endUserId
    ) {
      const hinted = await this.prisma.endUser.findUnique({
        where: { id: hintGuestId.trim() },
      });
      if (hinted && isDeviceGuestUser(hinted)) {
        guest = hinted;
      }
    }

    if (guest && guest.id !== endUser.id) {
      await mergeAinewsGuestIntoEndUser(this.prisma, guest.id, endUser.id);
    }

    await this.prisma.endUser.update({
      where: { id: endUser.id },
      data: {
        ...toAinewsEndUserUpdate(
          {
            deviceId: trimmedDeviceId || endUser.ainewsDeviceId || undefined,
            followDomains:
              endUser.ainewsFollowDomains.length > 0
                ? endUser.ainewsFollowDomains
                : defaultDomains,
          },
          now,
        ),
        ainewsLinkedAt: endUser.ainewsLinkedAt ?? now,
      },
    });

    if (trimmedDeviceId) {
      await upsertDeviceGuest(this.prisma, trimmedDeviceId, {});
    }

    return this.resolveForEndUser(endUser.id, email ?? endUser.email);
  }
}
