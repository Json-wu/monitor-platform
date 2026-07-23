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

    const ainewsAppId = await resolveAinewsAppId(this.prisma);
    const jwtUser = await this.prisma.endUser.findUnique({
      where: { id: endUserId },
      select: { id: true, email: true, appId: true, ainewsUserTier: true },
    });

    // 订阅写在 chrome-ainews 应用下；JWT 可能是同邮箱其它应用的用户，需按邮箱落到 ainews 用户
    let ainewsUserId = endUserId;
    if (!jwtUser || jwtUser.appId !== ainewsAppId) {
      const normalized = (email ?? jwtUser?.email ?? '').trim().toLowerCase();
      if (normalized) {
        const byEmail = await this.prisma.endUser.findUnique({
          where: { appId_email: { appId: ainewsAppId, email: normalized } },
          select: { id: true, ainewsUserTier: true },
        });
        if (byEmail) {
          ainewsUserId = byEmail.id;
          await this.mergePendingForEmail(normalized, byEmail.id);
        }
      }
    }

    let sub = await loadAinewsPlatformSubscription(this.prisma, ainewsUserId);

    // 同邮箱兜底：JWT 用户无订阅时，查 ainews 应用下该邮箱用户的订阅
    if (!sub) {
      const normalized = (email ?? jwtUser?.email ?? '').trim().toLowerCase();
      if (normalized && ainewsUserId === endUserId) {
        const byEmail = await this.prisma.endUser.findUnique({
          where: { appId_email: { appId: ainewsAppId, email: normalized } },
          select: { id: true },
        });
        if (byEmail && byEmail.id !== endUserId) {
          sub = await loadAinewsPlatformSubscription(this.prisma, byEmail.id);
        }
      }
    }

    let tier = tierFromPlatformSubscription(sub);
    const view = toAinewsSubscriptionView(sub);

    // 订阅存在但 slug 无法识别时，回退 end_user.ainews_user_tier
    if (tier === 'free' && sub?.status === 'active') {
      const tierField =
        (
          await this.prisma.endUser.findUnique({
            where: { id: ainewsUserId },
            select: { ainewsUserTier: true },
          })
        )?.ainewsUserTier?.trim()
          .toLowerCase() ?? '';
      if (tierField === 'pro' || tierField === 'unlimited') {
        tier = tierField;
      }
    }

    return {
      tier,
      limits: limitsForTier(tier),
      email: email ?? jwtUser?.email ?? null,
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
