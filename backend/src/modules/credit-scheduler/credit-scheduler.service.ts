import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { CreditReasonCode } from '../credit/credit-reason-codes';
import {
  nextSubscriptionMonthlyExpireUtc,
  utcDateKey,
} from '../../common/utils/credit-billing-dates.util';

const DAILY_PROMO_TARGET = 1;

@Injectable()
export class CreditSchedulerService {
  private readonly logger = new Logger(CreditSchedulerService.name);

  constructor(private readonly prisma: PrismaService) {}

  private schedulerDisabled(): boolean {
    return process.env.DISABLE_CREDIT_SCHEDULER === '1';
  }

  /** 每日 UTC 0:00：全应用活跃终端用户 promo 池重置为 1（已为 1 则跳过余额变更，仍标记当日已处理）。 */
  @Cron('0 0 * * *', { timeZone: 'UTC' })
  async runUtcMidnightCreditJobs(): Promise<void> {
    if (this.schedulerDisabled()) return;
    const t0 = Date.now();
    this.logger.log('UTC midnight credit scheduler started');
    try {
      await this.resetDailyPromoForAllActiveUsers();
      await this.expireMonthlySubscriptionCredits();
    } catch (e) {
      this.logger.error(
        `UTC midnight credit scheduler failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      throw e;
    } finally {
      this.logger.log(
        `UTC midnight credit scheduler done in ${Date.now() - t0}ms`,
      );
    }
  }

  private async resetDailyPromoForAllActiveUsers(): Promise<void> {
    const todayUtc = utcDateKey(new Date());
    const users = await this.prisma.endUser.findMany({
      where: { status: 'active' },
      select: { id: true, appId: true },
    });
    let touched = 0;
    for (const u of users) {
      const did = await this.resetDailyPromoForUser(u.id, u.appId, todayUtc);
      if (did) touched++;
    }
    this.logger.log(
      `daily promo reset: processed ${users.length} users, ${touched} accounts updated`,
    );
  }

  /** @returns 是否写库（含「已为 1 仅更新 lastDaily」） */
  private async resetDailyPromoForUser(
    userId: string,
    appId: string,
    todayUtc: string,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      let acc = await tx.creditAccount.findUnique({
        where: { userId_appId: { userId, appId } },
      });

      if (!acc) {
        acc = await tx.creditAccount.create({
          data: {
            userId,
            appId,
            balancePromo: DAILY_PROMO_TARGET,
            totalEarned: DAILY_PROMO_TARGET,
            lastDailyPromoResetDate: todayUtc,
          },
        });
        await tx.creditTransaction.create({
          data: {
            accountId: acc.id,
            appId,
            type: 'grant',
            creditType: 'promo',
            amount: DAILY_PROMO_TARGET,
            balanceAfter: DAILY_PROMO_TARGET,
            reason: CreditReasonCode.SchedulerDailyPromoReset,
            operatorId: null,
          },
        });
        return true;
      }

      if (acc.lastDailyPromoResetDate === todayUtc) {
        return false;
      }

      if (acc.balancePromo === DAILY_PROMO_TARGET) {
        await tx.creditAccount.update({
          where: { id: acc.id },
          data: { lastDailyPromoResetDate: todayUtc },
        });
        return true;
      }

      const prev = acc.balancePromo;
      if (prev < DAILY_PROMO_TARGET) {
        const delta = DAILY_PROMO_TARGET - prev;
        await tx.creditAccount.update({
          where: { id: acc.id },
          data: {
            balancePromo: DAILY_PROMO_TARGET,
            totalEarned: { increment: delta },
            lastDailyPromoResetDate: todayUtc,
          },
        });
        await tx.creditTransaction.create({
          data: {
            accountId: acc.id,
            appId,
            type: 'grant',
            creditType: 'promo',
            amount: delta,
            balanceAfter: DAILY_PROMO_TARGET,
            reason: CreditReasonCode.SchedulerDailyPromoReset,
            operatorId: null,
          },
        });
      } else {
        const delta = prev - DAILY_PROMO_TARGET;
        await tx.creditAccount.update({
          where: { id: acc.id },
          data: {
            balancePromo: DAILY_PROMO_TARGET,
            lastDailyPromoResetDate: todayUtc,
          },
        });
        await tx.creditTransaction.create({
          data: {
            accountId: acc.id,
            appId,
            type: 'expire',
            creditType: 'promo',
            amount: -delta,
            balanceAfter: DAILY_PROMO_TARGET,
            reason: CreditReasonCode.SchedulerDailyPromoReset,
            operatorId: null,
          },
        });
      }
      return true;
    });
  }

  /**
   * 订阅用户：到达 `subscription.current_period_end`（UTC 00:00 边界）时，
   * 将 subscription 池置 0；已为 0 则跳过流水，但仍推进下一周期。
   */
  private async expireMonthlySubscriptionCredits(): Promise<void> {
    let expired = 0;
    let advanced = 0;
    let batch = 0;
    const maxBatches = 200;
    while (batch++ < maxBatches) {
      const now = new Date();
      const subs = await this.prisma.subscription.findMany({
        where: {
          status: 'active',
          currentPeriodEnd: { lte: now },
        },
        select: { id: true, appId: true, userId: true, currentPeriodEnd: true },
      });
      if (subs.length === 0) break;
      for (const sub of subs) {
        const r = await this.processSubscriptionPeriodRoll(sub, now);
        if (r.expired) expired++;
        if (r.advanced) advanced++;
      }
    }
    this.logger.log(
      `monthly subscription credit expire: cleared=${expired}, periods_advanced=${advanced}, batches=${batch - 1}`,
    );
  }

  private async processSubscriptionPeriodRoll(
    sub: { id: string; appId: string; userId: string; currentPeriodEnd: Date },
    now: Date,
  ): Promise<{ expired: boolean; advanced: boolean }> {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.subscription.findFirst({
        where: { id: sub.id, status: 'active', currentPeriodEnd: { lte: now } },
      });
      if (!row) {
        return { expired: false, advanced: false };
      }

      let acc = await tx.creditAccount.findUnique({
        where: { userId_appId: { userId: row.userId, appId: row.appId } },
      });
      if (!acc) {
        acc = await tx.creditAccount.create({
          data: { userId: row.userId, appId: row.appId },
        });
      }

      let expired = false;
      const subBal = acc.balanceSub;
      if (subBal > 0) {
        await tx.creditAccount.update({
          where: { id: acc.id },
          data: { balanceSub: 0 },
        });
        await tx.creditTransaction.create({
          data: {
            accountId: acc.id,
            appId: row.appId,
            type: 'expire',
            creditType: 'subscription',
            amount: -subBal,
            balanceAfter: 0,
            reason: CreditReasonCode.SchedulerMonthlySubExpire,
            referenceId: row.id,
            operatorId: null,
          },
        });
        expired = true;
      }

      const nextEnd = nextSubscriptionMonthlyExpireUtc(row.currentPeriodEnd);
      await tx.subscription.update({
        where: { id: row.id },
        data: {
          currentPeriodStart: row.currentPeriodEnd,
          currentPeriodEnd: nextEnd,
        },
      });

      return { expired, advanced: true };
    });
  }
}
