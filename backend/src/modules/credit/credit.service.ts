import {
  Injectable,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { getClientIp } from '../../common/utils/request.util';
import { GrantCreditsDto, DeductCreditsDto } from './dto/credit.dto';
import { CreditReasonCode } from './credit-reason-codes';
import type { CreditType } from '@prisma/client';
import { Prisma, TransactionType } from '@prisma/client';

@Injectable()
export class CreditService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  async getAccount(userId: string, appId: string) {
    let account = await this.prisma.creditAccount.findUnique({
      where: { userId_appId: { userId, appId } },
    });

    if (!account) {
      account = await this.prisma.creditAccount.create({
        data: { userId, appId },
      });
    }

    return account;
  }

  async grant(
    dto: GrantCreditsDto,
    operator: { id: string; email: string },
    req: Request,
  ) {
    const account = await this.getAccount(dto.userId, dto.appId);

    const balanceField =
      dto.creditType === 'subscription'
        ? 'balanceSub'
        : dto.creditType === 'payg'
          ? 'balancePayg'
          : 'balancePromo';
    const newBalance = account[balanceField] + dto.amount;

    const [updatedAccount, transaction] = await this.prisma.$transaction([
      this.prisma.creditAccount.update({
        where: { id: account.id },
        data: {
          [balanceField]: { increment: dto.amount },
          totalEarned: { increment: dto.amount },
        },
      }),
      this.prisma.creditTransaction.create({
        data: {
          accountId: account.id,
          appId: dto.appId,
          type: 'grant',
          creditType: dto.creditType,
          amount: dto.amount,
          balanceAfter: newBalance,
          reason: dto.reason,
          referenceId: dto.referenceId,
          operatorId: operator.id,
        },
      }),
    ]);

    await this.auditService.logEndUserAction({
      appId: dto.appId,
      endUserId: dto.userId,
      module: 'credits',
      action: 'grant',
      summary: `终端用户积分发放 ${dto.amount} (${dto.creditType})`,
      metadata: {
        amount: dto.amount,
        creditType: dto.creditType,
        transactionId: transaction.id,
      },
      actorAdminId: operator.id,
      actorAdminEmail: operator.email,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'],
    });

    return { account: updatedAccount, transaction };
  }

  async deduct(
    dto: DeductCreditsDto,
    operator: { id: string; email: string },
    req: Request,
  ) {
    const account = await this.getAccount(dto.userId, dto.appId);

    const totalBalance =
      account.balanceSub + account.balancePayg + account.balancePromo;
    if (totalBalance < dto.amount) {
      throw new BadRequestException(
        `Insufficient credits. Available: ${totalBalance}, Requested: ${dto.amount}`,
      );
    }

    let remaining = dto.amount;
    const updates: Prisma.CreditAccountUpdateInput = {
      totalSpent: { increment: dto.amount },
    };

    /** Daily(promo) → Monthly(subscription) → Permanent(payg) */
    const slices: { creditType: CreditType; n: number }[] = [];
    if (remaining > 0 && account.balancePromo > 0) {
      const n = Math.min(remaining, account.balancePromo);
      slices.push({ creditType: 'promo', n });
      updates.balancePromo = { decrement: n };
      remaining -= n;
    }
    if (remaining > 0 && account.balanceSub > 0) {
      const n = Math.min(remaining, account.balanceSub);
      slices.push({ creditType: 'subscription', n });
      updates.balanceSub = { decrement: n };
      remaining -= n;
    }
    if (remaining > 0 && account.balancePayg > 0) {
      const n = Math.min(remaining, account.balancePayg);
      slices.push({ creditType: 'payg', n });
      updates.balancePayg = { decrement: n };
      remaining -= n;
    }

    const createdIds: string[] = [];
    const updatedAccount = await this.prisma.$transaction(async (tx) => {
      const acc = await tx.creditAccount.update({
        where: { id: account.id },
        data: updates,
      });
      let running = totalBalance;
      for (const s of slices) {
        running -= s.n;
        const row = await tx.creditTransaction.create({
          data: {
            accountId: account.id,
            appId: dto.appId,
            type: 'deduct',
            creditType: s.creditType,
            amount: -s.n,
            balanceAfter: running,
            reason: dto.reason,
            referenceId: dto.referenceId,
            operatorId: operator.id,
          },
        });
        createdIds.push(row.id);
      }
      return acc;
    });

    await this.auditService.logEndUserAction({
      appId: dto.appId,
      endUserId: dto.userId,
      module: 'credits',
      action: 'deduct',
      summary: `终端用户积分扣减 ${dto.amount}`,
      metadata: { amount: dto.amount, transactionIds: createdIds },
      actorAdminId: operator.id,
      actorAdminEmail: operator.email,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'],
    });

    return { account: updatedAccount, transactionIds: createdIds };
  }

  /**
   * 公开抠图 API：已识别终端用户每次成功排队前扣 1 分；余额不足则抛错（由调用方在上游失败时调用 refundClearbgApiFailure）。
   * 扣减顺序：Daily(promo) → Monthly(subscription) → Permanent(payg)。
   * @returns 实际扣减的积分池类型（用于失败时按同池退回）
   */
  async deductForClearbgApi(
    userId: string,
    appId: string,
  ): Promise<CreditType> {
    const amount = 1;
    const account = await this.getAccount(userId, appId);

    const totalBalance =
      account.balanceSub + account.balancePayg + account.balancePromo;
    if (totalBalance < amount) {
      throw new ForbiddenException(
        'Insufficient credits. Please purchase more credits or upgrade your plan.',
      );
    }

    let remaining = amount;
    const updates: Prisma.CreditAccountUpdateInput = {
      totalSpent: { increment: amount },
    };

    let debitedCreditType: CreditType = 'payg';
    if (remaining > 0 && account.balancePromo > 0) {
      const n = Math.min(remaining, account.balancePromo);
      updates.balancePromo = { decrement: n };
      remaining -= n;
      debitedCreditType = 'promo';
    } else if (remaining > 0 && account.balanceSub > 0) {
      const n = Math.min(remaining, account.balanceSub);
      updates.balanceSub = { decrement: n };
      remaining -= n;
      debitedCreditType = 'subscription';
    } else if (remaining > 0 && account.balancePayg > 0) {
      const n = Math.min(remaining, account.balancePayg);
      updates.balancePayg = { decrement: n };
      remaining -= n;
      debitedCreditType = 'payg';
    }

    await this.prisma.$transaction([
      this.prisma.creditAccount.update({
        where: { id: account.id },
        data: updates,
      }),
      this.prisma.creditTransaction.create({
        data: {
          accountId: account.id,
          appId,
          type: 'deduct',
          creditType: debitedCreditType,
          amount: -amount,
          balanceAfter: totalBalance - amount,
          reason: CreditReasonCode.ClearbgApiDeduct,
          operatorId: null,
        },
      }),
    ]);

    return debitedCreditType;
  }

  /**
   * 上游抠图失败时退回刚扣的 1 分，退回至与扣减时相同的积分池（Daily / Monthly / Permanent）。
   */
  async refundClearbgApiFailure(
    userId: string,
    appId: string,
    creditType: CreditType,
  ): Promise<void> {
    const account = await this.prisma.creditAccount.findUnique({
      where: { userId_appId: { userId, appId } },
    });
    if (!account) return;

    const balanceField =
      creditType === 'promo'
        ? 'balancePromo'
        : creditType === 'subscription'
          ? 'balanceSub'
          : 'balancePayg';
    const totalAfter =
      account.balanceSub + account.balancePayg + account.balancePromo + 1;

    await this.prisma.$transaction([
      this.prisma.creditAccount.update({
        where: { id: account.id },
        data: {
          [balanceField]: { increment: 1 },
          totalSpent: { decrement: 1 },
        },
      }),
      this.prisma.creditTransaction.create({
        data: {
          accountId: account.id,
          appId,
          type: 'refund',
          creditType,
          amount: 1,
          balanceAfter: totalAfter,
          reason: CreditReasonCode.ClearbgApiRefund,
          operatorId: null,
        },
      }),
    ]);
  }

  /**
   * 公开可灵生图 API：与 {@link deductForClearbgApi} 相同扣减顺序与金额，流水 reason 不同。
   */
  async deductForKlingImageApi(
    userId: string,
    appId: string,
  ): Promise<CreditType> {
    const amount = 1;
    const account = await this.getAccount(userId, appId);

    const totalBalance =
      account.balanceSub + account.balancePayg + account.balancePromo;
    if (totalBalance < amount) {
      throw new ForbiddenException(
        'Insufficient credits. Please purchase more credits or upgrade your plan.',
      );
    }

    let remaining = amount;
    const updates: Prisma.CreditAccountUpdateInput = {
      totalSpent: { increment: amount },
    };

    let debitedCreditType: CreditType = 'payg';
    if (remaining > 0 && account.balancePromo > 0) {
      const n = Math.min(remaining, account.balancePromo);
      updates.balancePromo = { decrement: n };
      remaining -= n;
      debitedCreditType = 'promo';
    } else if (remaining > 0 && account.balanceSub > 0) {
      const n = Math.min(remaining, account.balanceSub);
      updates.balanceSub = { decrement: n };
      remaining -= n;
      debitedCreditType = 'subscription';
    } else if (remaining > 0 && account.balancePayg > 0) {
      const n = Math.min(remaining, account.balancePayg);
      updates.balancePayg = { decrement: n };
      remaining -= n;
      debitedCreditType = 'payg';
    }

    await this.prisma.$transaction([
      this.prisma.creditAccount.update({
        where: { id: account.id },
        data: updates,
      }),
      this.prisma.creditTransaction.create({
        data: {
          accountId: account.id,
          appId,
          type: 'deduct',
          creditType: debitedCreditType,
          amount: -amount,
          balanceAfter: totalBalance - amount,
          reason: CreditReasonCode.KlingImageApiDeduct,
          operatorId: null,
        },
      }),
    ]);

    return debitedCreditType;
  }

  async refundKlingImageApiFailure(
    userId: string,
    appId: string,
    creditType: CreditType,
  ): Promise<void> {
    const account = await this.prisma.creditAccount.findUnique({
      where: { userId_appId: { userId, appId } },
    });
    if (!account) return;

    const balanceField =
      creditType === 'promo'
        ? 'balancePromo'
        : creditType === 'subscription'
          ? 'balanceSub'
          : 'balancePayg';
    const totalAfter =
      account.balanceSub + account.balancePayg + account.balancePromo + 1;

    await this.prisma.$transaction([
      this.prisma.creditAccount.update({
        where: { id: account.id },
        data: {
          [balanceField]: { increment: 1 },
          totalSpent: { decrement: 1 },
        },
      }),
      this.prisma.creditTransaction.create({
        data: {
          accountId: account.id,
          appId,
          type: 'refund',
          creditType,
          amount: 1,
          balanceAfter: totalAfter,
          reason: CreditReasonCode.KlingImageApiRefund,
          operatorId: null,
        },
      }),
    ]);
  }

  /**
   * 公开 DDColor 上色 API：调用前扣 1 分；失败时调用 refundDdcolorApiFailure 退回。
   */
  async deductForDdcolorApi(
    userId: string,
    appId: string,
  ): Promise<CreditType> {
    const amount = 1;
    const account = await this.getAccount(userId, appId);

    const totalBalance =
      account.balanceSub + account.balancePayg + account.balancePromo;
    if (totalBalance < amount) {
      throw new ForbiddenException(
        'Insufficient credits. Please purchase more credits or upgrade your plan.',
      );
    }

    let remaining = amount;
    const updates: Prisma.CreditAccountUpdateInput = {
      totalSpent: { increment: amount },
    };

    let debitedCreditType: CreditType = 'payg';
    if (remaining > 0 && account.balancePromo > 0) {
      const n = Math.min(remaining, account.balancePromo);
      updates.balancePromo = { decrement: n };
      remaining -= n;
      debitedCreditType = 'promo';
    } else if (remaining > 0 && account.balanceSub > 0) {
      const n = Math.min(remaining, account.balanceSub);
      updates.balanceSub = { decrement: n };
      remaining -= n;
      debitedCreditType = 'subscription';
    } else if (remaining > 0 && account.balancePayg > 0) {
      const n = Math.min(remaining, account.balancePayg);
      updates.balancePayg = { decrement: n };
      remaining -= n;
      debitedCreditType = 'payg';
    }

    await this.prisma.$transaction([
      this.prisma.creditAccount.update({
        where: { id: account.id },
        data: updates,
      }),
      this.prisma.creditTransaction.create({
        data: {
          accountId: account.id,
          appId,
          type: 'deduct',
          creditType: debitedCreditType,
          amount: -amount,
          balanceAfter: totalBalance - amount,
          reason: CreditReasonCode.DdcolorApiDeduct,
          operatorId: null,
        },
      }),
    ]);

    return debitedCreditType;
  }

  async refundDdcolorApiFailure(
    userId: string,
    appId: string,
    creditType: CreditType,
  ): Promise<void> {
    const account = await this.prisma.creditAccount.findUnique({
      where: { userId_appId: { userId, appId } },
    });
    if (!account) return;

    const balanceField =
      creditType === 'promo'
        ? 'balancePromo'
        : creditType === 'subscription'
          ? 'balanceSub'
          : 'balancePayg';
    const totalAfter =
      account.balanceSub + account.balancePayg + account.balancePromo + 1;

    await this.prisma.$transaction([
      this.prisma.creditAccount.update({
        where: { id: account.id },
        data: {
          [balanceField]: { increment: 1 },
          totalSpent: { decrement: 1 },
        },
      }),
      this.prisma.creditTransaction.create({
        data: {
          accountId: account.id,
          appId,
          type: 'refund',
          creditType,
          amount: 1,
          balanceAfter: totalAfter,
          reason: CreditReasonCode.DdcolorApiRefund,
          operatorId: null,
        },
      }),
    ]);
  }

  /**
   * 公开超分去模糊 API：调用前扣分（默认 1；strength=strong 等为 3）。
   * 按 promo → subscription → payg 顺序跨池扣满 amount；失败时把返回的 breakdown 交给 refundUpscaleApiFailure。
   */
  async deductForUpscaleApi(
    userId: string,
    appId: string,
    amount = 1,
  ): Promise<Array<{ creditType: CreditType; amount: number }>> {
    if (!Number.isFinite(amount) || amount < 1 || amount > 100) {
      throw new BadRequestException('Invalid upscale credit amount');
    }
    const nAmount = Math.floor(amount);

    const account = await this.getAccount(userId, appId);

    const totalBalance =
      account.balanceSub + account.balancePayg + account.balancePromo;
    if (totalBalance < nAmount) {
      throw new ForbiddenException(
        'Insufficient credits. Please purchase more credits or upgrade your plan.',
      );
    }

    const breakdown: Array<{ creditType: CreditType; amount: number }> = [];
    let remaining = nAmount;

    if (remaining > 0 && account.balancePromo > 0) {
      const n = Math.min(remaining, account.balancePromo);
      breakdown.push({ creditType: 'promo', amount: n });
      remaining -= n;
    }
    if (remaining > 0 && account.balanceSub > 0) {
      const n = Math.min(remaining, account.balanceSub);
      breakdown.push({ creditType: 'subscription', amount: n });
      remaining -= n;
    }
    if (remaining > 0 && account.balancePayg > 0) {
      const n = Math.min(remaining, account.balancePayg);
      breakdown.push({ creditType: 'payg', amount: n });
      remaining -= n;
    }

    if (remaining > 0) {
      throw new ForbiddenException(
        'Insufficient credits. Please purchase more credits or upgrade your plan.',
      );
    }

    const promoD = breakdown
      .filter((b) => b.creditType === 'promo')
      .reduce((s, b) => s + b.amount, 0);
    const subD = breakdown
      .filter((b) => b.creditType === 'subscription')
      .reduce((s, b) => s + b.amount, 0);
    const paygD = breakdown
      .filter((b) => b.creditType === 'payg')
      .reduce((s, b) => s + b.amount, 0);

    const data: Prisma.CreditAccountUpdateInput = {
      totalSpent: { increment: nAmount },
    };
    if (promoD > 0) data.balancePromo = { decrement: promoD };
    if (subD > 0) data.balanceSub = { decrement: subD };
    if (paygD > 0) data.balancePayg = { decrement: paygD };

    const deductTxs = [];
    let running = totalBalance;
    for (const b of breakdown) {
      running -= b.amount;
      deductTxs.push(
        this.prisma.creditTransaction.create({
          data: {
            accountId: account.id,
            appId,
            type: 'deduct',
            creditType: b.creditType,
            amount: -b.amount,
            balanceAfter: running,
            reason: CreditReasonCode.UpscaleApiDeduct,
            operatorId: null,
          },
        }),
      );
    }

    await this.prisma.$transaction([
      this.prisma.creditAccount.update({
        where: { id: account.id },
        data,
      }),
      ...deductTxs,
    ]);
    return breakdown;
  }

  async refundUpscaleApiFailure(
    userId: string,
    appId: string,
    breakdown: Array<{ creditType: CreditType; amount: number }>,
  ): Promise<void> {
    if (!breakdown.length) return;
    const account = await this.prisma.creditAccount.findUnique({
      where: { userId_appId: { userId, appId } },
    });
    if (!account) return;

    const totalRefund = breakdown.reduce((s, x) => s + x.amount, 0);
    const promoR = breakdown
      .filter((b) => b.creditType === 'promo')
      .reduce((s, b) => s + b.amount, 0);
    const subR = breakdown
      .filter((b) => b.creditType === 'subscription')
      .reduce((s, b) => s + b.amount, 0);
    const paygR = breakdown
      .filter((b) => b.creditType === 'payg')
      .reduce((s, b) => s + b.amount, 0);

    const data: Prisma.CreditAccountUpdateInput = {
      totalSpent: { decrement: totalRefund },
    };
    if (promoR > 0) data.balancePromo = { increment: promoR };
    if (subR > 0) data.balanceSub = { increment: subR };
    if (paygR > 0) data.balancePayg = { increment: paygR };

    const refundTxs = [];
    let running =
      account.balanceSub + account.balancePayg + account.balancePromo;
    for (const { creditType, amount } of breakdown) {
      running += amount;
      refundTxs.push(
        this.prisma.creditTransaction.create({
          data: {
            accountId: account.id,
            appId,
            type: 'refund',
            creditType,
            amount,
            balanceAfter: running,
            reason: CreditReasonCode.UpscaleApiRefund,
            operatorId: null,
          },
        }),
      );
    }

    await this.prisma.$transaction([
      this.prisma.creditAccount.update({
        where: { id: account.id },
        data,
      }),
      ...refundTxs,
    ]);
  }

  /**
   * 公开房间装修图 API（可灵）：按主题数量扣分（每主题 1 分，1～4）。
   * 扣减顺序与 {@link deductForUpscaleApi} 相同；失败时用 {@link refundRoomDecorationApiFailure}。
   */
  async deductForRoomDecorationApi(
    userId: string,
    appId: string,
    amount: number,
  ): Promise<Array<{ creditType: CreditType; amount: number }>> {
    if (!Number.isFinite(amount) || amount < 1 || amount > 4) {
      throw new BadRequestException('Invalid room decoration credit amount');
    }
    const nAmount = Math.floor(amount);

    const account = await this.getAccount(userId, appId);

    const totalBalance =
      account.balanceSub + account.balancePayg + account.balancePromo;
    if (totalBalance < nAmount) {
      throw new ForbiddenException(
        'Insufficient credits. Please purchase more credits or upgrade your plan.',
      );
    }

    const breakdown: Array<{ creditType: CreditType; amount: number }> = [];
    let remaining = nAmount;

    if (remaining > 0 && account.balancePromo > 0) {
      const n = Math.min(remaining, account.balancePromo);
      breakdown.push({ creditType: 'promo', amount: n });
      remaining -= n;
    }
    if (remaining > 0 && account.balanceSub > 0) {
      const n = Math.min(remaining, account.balanceSub);
      breakdown.push({ creditType: 'subscription', amount: n });
      remaining -= n;
    }
    if (remaining > 0 && account.balancePayg > 0) {
      const n = Math.min(remaining, account.balancePayg);
      breakdown.push({ creditType: 'payg', amount: n });
      remaining -= n;
    }

    if (remaining > 0) {
      throw new ForbiddenException(
        'Insufficient credits. Please purchase more credits or upgrade your plan.',
      );
    }

    const promoD = breakdown
      .filter((b) => b.creditType === 'promo')
      .reduce((s, b) => s + b.amount, 0);
    const subD = breakdown
      .filter((b) => b.creditType === 'subscription')
      .reduce((s, b) => s + b.amount, 0);
    const paygD = breakdown
      .filter((b) => b.creditType === 'payg')
      .reduce((s, b) => s + b.amount, 0);

    const data: Prisma.CreditAccountUpdateInput = {
      totalSpent: { increment: nAmount },
    };
    if (promoD > 0) data.balancePromo = { decrement: promoD };
    if (subD > 0) data.balanceSub = { decrement: subD };
    if (paygD > 0) data.balancePayg = { decrement: paygD };

    const deductTxs = [];
    let running = totalBalance;
    for (const b of breakdown) {
      running -= b.amount;
      deductTxs.push(
        this.prisma.creditTransaction.create({
          data: {
            accountId: account.id,
            appId,
            type: 'deduct',
            creditType: b.creditType,
            amount: -b.amount,
            balanceAfter: running,
            reason: CreditReasonCode.RoomDecorationApiDeduct,
            operatorId: null,
          },
        }),
      );
    }

    await this.prisma.$transaction([
      this.prisma.creditAccount.update({
        where: { id: account.id },
        data,
      }),
      ...deductTxs,
    ]);
    return breakdown;
  }

  async refundRoomDecorationApiFailure(
    userId: string,
    appId: string,
    breakdown: Array<{ creditType: CreditType; amount: number }>,
  ): Promise<void> {
    if (!breakdown.length) return;
    const account = await this.prisma.creditAccount.findUnique({
      where: { userId_appId: { userId, appId } },
    });
    if (!account) return;

    const totalRefund = breakdown.reduce((s, x) => s + x.amount, 0);
    const promoR = breakdown
      .filter((b) => b.creditType === 'promo')
      .reduce((s, b) => s + b.amount, 0);
    const subR = breakdown
      .filter((b) => b.creditType === 'subscription')
      .reduce((s, b) => s + b.amount, 0);
    const paygR = breakdown
      .filter((b) => b.creditType === 'payg')
      .reduce((s, b) => s + b.amount, 0);

    const data: Prisma.CreditAccountUpdateInput = {
      totalSpent: { decrement: totalRefund },
    };
    if (promoR > 0) data.balancePromo = { increment: promoR };
    if (subR > 0) data.balanceSub = { increment: subR };
    if (paygR > 0) data.balancePayg = { increment: paygR };

    const refundTxs = [];
    let running =
      account.balanceSub + account.balancePayg + account.balancePromo;
    for (const { creditType, amount } of breakdown) {
      running += amount;
      refundTxs.push(
        this.prisma.creditTransaction.create({
          data: {
            accountId: account.id,
            appId,
            type: 'refund',
            creditType,
            amount,
            balanceAfter: running,
            reason: CreditReasonCode.RoomDecorationApiRefund,
            operatorId: null,
          },
        }),
      );
    }

    await this.prisma.$transaction([
      this.prisma.creditAccount.update({
        where: { id: account.id },
        data,
      }),
      ...refundTxs,
    ]);
  }

  async getTransactions(
    filters: { userId?: string; appId?: string; type?: string },
    page = 1,
    limit = 50,
  ) {
    const where: Prisma.CreditTransactionWhereInput = {};

    if (filters.appId) where.appId = filters.appId;
    if (filters.type) {
      where.type = filters.type as TransactionType;
    }
    if (filters.userId) {
      where.account = { userId: filters.userId };
    }

    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.creditTransaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          account: {
            select: {
              user: { select: { id: true, email: true, name: true } },
              app: { select: { id: true, name: true } },
            },
          },
          operator: { select: { id: true, name: true, email: true } },
        },
      }),
      this.prisma.creditTransaction.count({ where }),
    ]);

    return { data, total, page, limit };
  }
}
