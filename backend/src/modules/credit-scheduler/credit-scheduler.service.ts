import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { CreditReasonCode } from '../credit/credit-reason-codes';
import {
  nextSubscriptionMonthlyExpireUtc,
  utcDateKey,
} from '../../common/utils/credit-billing-dates.util';
import { dailyPromoCredits } from '../../common/utils/credit-env.util';
import { OpsJobName } from '../ops/ops-job.constants';
import { OpsJobTracker } from '../ops/ops-job-tracker.service';
import { OpsRuntimeRegistry } from '../ops/ops-runtime.registry';

const RUNTIME_SOURCE = 'credit-scheduler';

@Injectable()
export class CreditSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CreditSchedulerService.name);
  private running = false;
  private startedAt: number | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly opsTracker: OpsJobTracker,
    private readonly opsRuntime: OpsRuntimeRegistry,
  ) {}

  onModuleInit() {
    this.opsRuntime.register(RUNTIME_SOURCE, () => [
      {
        jobName: OpsJobName.CreditUtcMidnight,
        enabled: !this.schedulerDisabled(),
        running: this.running,
        startedAt: this.startedAt
          ? new Date(this.startedAt).toISOString()
          : null,
      },
    ]);
  }

  onModuleDestroy() {
    this.opsRuntime.unregister(RUNTIME_SOURCE);
  }

  private schedulerDisabled(): boolean {
    return process.env.DISABLE_CREDIT_SCHEDULER === '1';
  }

  /** 每日 UTC 0:00：全应用活跃终端用户 promo 池重置为 DAILY_PROMO_CREDITS（默认 1）。 */
  @Cron('0 0 * * *', { timeZone: 'UTC' })
  async runUtcMidnightCreditJobs(): Promise<void> {
    if (this.schedulerDisabled()) {
      await this.opsTracker.skip(OpsJobName.CreditUtcMidnight, 'disabled');
      return;
    }
    if (this.running) {
      await this.opsTracker.skip(
        OpsJobName.CreditUtcMidnight,
        'already_running',
      );
      return;
    }
    this.running = true;
    this.startedAt = Date.now();
    const t0 = Date.now();
    const runId = await this.opsTracker.start(OpsJobName.CreditUtcMidnight);
    this.logger.log('UTC midnight credit scheduler started');
    try {
      await this.resetDailyPromoForAllActiveUsers();
      await this.expireMonthlySubscriptionCredits();
      await this.opsTracker.success(
        runId,
        `done in ${Date.now() - t0}ms`,
      );
    } catch (e) {
      this.logger.error(
        `UTC midnight credit scheduler failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      await this.opsTracker.fail(runId, e);
      throw e;
    } finally {
      this.running = false;
      this.startedAt = null;
      this.logger.log(
        `UTC midnight credit scheduler done in ${Date.now() - t0}ms`,
      );
    }
  }

  private async resetDailyPromoForAllActiveUsers(): Promise<void> {
    const todayUtc = utcDateKey(new Date());
    const target = dailyPromoCredits();
    const users = await this.prisma.endUser.findMany({
      where: { status: 'active' },
      select: { id: true, appId: true },
    });
    let touched = 0;
    for (const u of users) {
      const did = await this.resetDailyPromoForUser(
        u.id,
        u.appId,
        todayUtc,
        target,
      );
      if (did) touched++;
    }
    this.logger.log(
      `daily promo reset (target=${target}): processed ${users.length} users, ${touched} accounts updated`,
    );
  }

  /** @returns 是否写库（含「已为目标值仅更新 lastDaily」） */
  private async resetDailyPromoForUser(
    userId: string,
    appId: string,
    todayUtc: string,
    target: number,
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
            balancePromo: target,
            totalEarned: target,
            lastDailyPromoResetDate: todayUtc,
          },
        });
        if (target > 0) {
          // balanceAfter = 三池合计（新建账号仅有 promo）
          await tx.creditTransaction.create({
            data: {
              accountId: acc.id,
              appId,
              type: 'grant',
              creditType: 'promo',
              amount: target,
              balanceAfter: target,
              reason: CreditReasonCode.SchedulerDailyPromoReset,
              operatorId: null,
            },
          });
        }
        return true;
      }

      if (acc.lastDailyPromoResetDate === todayUtc) {
        return false;
      }

      if (acc.balancePromo === target) {
        await tx.creditAccount.update({
          where: { id: acc.id },
          data: { lastDailyPromoResetDate: todayUtc },
        });
        return true;
      }

      const prev = acc.balancePromo;
      // 变动后余额统一记用户总余额（sub + payg + promo），与扣费流水一致
      const totalAfter = acc.balanceSub + acc.balancePayg + target;
      if (prev < target) {
        const delta = target - prev;
        await tx.creditAccount.update({
          where: { id: acc.id },
          data: {
            balancePromo: target,
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
            balanceAfter: totalAfter,
            reason: CreditReasonCode.SchedulerDailyPromoReset,
            operatorId: null,
          },
        });
      } else {
        const delta = prev - target;
        await tx.creditAccount.update({
          where: { id: acc.id },
          data: {
            balancePromo: target,
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
            balanceAfter: totalAfter,
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
            balanceAfter: acc.balancePayg + acc.balancePromo,
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
