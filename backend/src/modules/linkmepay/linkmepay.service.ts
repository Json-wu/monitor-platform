import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  BillingInterval,
  CreditType,
  OrderType,
  Prisma,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  readIntegrationsRoot,
  type LinkmePayIntegration,
} from '../../common/utils/integration-settings.util';
import { linkmePaySign } from './linkmepay-signature.util';
import { CreateLinkmePayCollectDto } from './dto/create-collect.dto';
import type { LinkmePayCollectNotifyPayload } from './dto/collect-notify.dto';
import { firstSubscriptionMonthlyExpireUtc } from '../../common/utils/credit-billing-dates.util';
import { GlobalIntegrationSettingsService } from '../global-integration/global-integration-settings.service';

const DEFAULT_BASE = 'https://api.linkmepay.com';

@Injectable()
export class LinkmePayService {
  private readonly logger = new Logger(LinkmePayService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly globalIntegration: GlobalIntegrationSettingsService,
  ) {}

  getLinkmePayConfig(settings: unknown): LinkmePayIntegration | null {
    const root = readIntegrationsRoot(settings);
    const lm = root.linkmePay;
    if (!lm || typeof lm !== 'object') return null;
    return lm;
  }

  parseActiveConfig(
    settings: unknown,
  ): Required<
    Pick<
      LinkmePayIntegration,
      'pid' | 'secretKey' | 'defaultAction' | 'notifyPublicBase'
    >
  > & { baseUrl: string } {
    const lm = this.getLinkmePayConfig(settings);
    if (!lm?.enabled) {
      throw new ServiceUnavailableException(
        'LinkMePay integration is disabled',
      );
    }
    const baseUrl = (lm.baseUrl || DEFAULT_BASE).replace(/\/+$/, '');
    const pid = lm.pid?.trim();
    const secretKey = lm.secretKey?.trim();
    const defaultAction = lm.defaultAction?.trim();
    const notifyPublicBase = lm.notifyPublicBase?.trim().replace(/\/+$/, '');
    if (!pid || !secretKey || !defaultAction || !notifyPublicBase) {
      throw new ServiceUnavailableException(
        'LinkMePay is not fully configured (pid, secretKey, defaultAction, notifyPublicBase)',
      );
    }
    return {
      baseUrl,
      pid,
      secretKey,
      defaultAction,
      notifyPublicBase,
    };
  }

  async createSubscriptionCollect(
    appId: string,
    dto: CreateLinkmePayCollectDto,
  ) {
    const app = await this.prisma.application.findUnique({
      where: { id: appId },
    });
    if (!app) throw new BadRequestException('Application not found');
    const globalSettings = await this.globalIntegration.getSettingsObject();
    const cfg = this.parseActiveConfig(globalSettings);

    const planIdRaw = dto.planId.trim();
    const plan = await this.prisma.pricingPlan.findUnique({
      where: { id: planIdRaw },
    });
    if (!plan || plan.appId !== appId || !plan.isActive) {
      throw new BadRequestException('Pricing plan not found or inactive');
    }

    const isPaygPack = plan.billingInterval === BillingInterval.one_time;
    let quantity = dto.quantity;
    if (!isPaygPack) {
      if (quantity !== 1) {
        throw new BadRequestException(
          'For subscription plans, quantity must be 1',
        );
      }
      quantity = 1;
    }

    const unitPrice = Number(plan.price);
    const totalAmount = Number((unitPrice * quantity).toFixed(2));
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      throw new BadRequestException(
        'Invalid plan price or computed order amount',
      );
    }
    const creditsTotal = plan.creditsPerCycle * quantity;
    const orderType: OrderType = isPaygPack
      ? OrderType.payg
      : OrderType.subscription;

    const payerIdRaw = dto.payerId.trim();
    const row = await this.prisma.endUser.findFirst({
      where: {
        id: payerIdRaw,
        appId,
        status: UserStatus.active,
      },
      select: { id: true, email: true },
    });
    if (!row) {
      throw new BadRequestException('End user not found for this application');
    }
    const user = { id: row.id, email: row.email };

    const gatewayPayload: Record<string, unknown> = {};
    if (isPaygPack) gatewayPayload.quantity = quantity;

    const order = await this.prisma.order.create({
      data: {
        appId,
        userId: user.id,
        orderNo: this.generateOrderNo(),
        type: orderType,
        status: 'pending',
        amount: new Prisma.Decimal(totalAmount.toFixed(2)),
        currency: plan.currency || 'USD',
        planId: plan.id,
        creditsGranted: creditsTotal,
        gateway: 'linkmepay',
        gatewayPayload:
          Object.keys(gatewayPayload).length > 0
            ? (gatewayPayload as Prisma.InputJsonValue)
            : undefined,
      },
    });

    const trade_timestamp = Date.now();
    const trade_money = totalAmount;
    const notify_url = `${cfg.notifyPublicBase}/api/payment/webhooks/linkmepay`;

    const rawParams: Record<string, unknown> = {
      version: 'v1',
      pid: cfg.pid,
      biz_no: order.orderNo,
      trade_money,
      trade_timestamp,
      currency: 'USD',
      action: cfg.defaultAction,
      notify_url,
      uid: user.email,
      args: order.id,
    };

    const signature = linkmePaySign(rawParams, cfg.secretKey);
    const body = { ...rawParams, signature };

    const url = `${cfg.baseUrl}/api/order/collect`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`LinkMePay collect failed: ${msg}`);
      throw new ServiceUnavailableException(`LinkMePay unreachable: ${msg}`);
    }

    const text = await res.text();
    let json: Record<string, unknown>;
    try {
      json = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new BadRequestException(
        `Invalid response from LinkMePay: ${text.slice(0, 300)}`,
      );
    }

    const gatewayOrderId =
      typeof json.orderNumber === 'string' ? json.orderNumber : undefined;
    if (gatewayOrderId) {
      await this.prisma.order.update({
        where: { id: order.id },
        data: {
          gatewayOrderId,
          gatewayPayload: json as Prisma.InputJsonValue,
        },
      });
    } else {
      await this.prisma.order.update({
        where: { id: order.id },
        data: { gatewayPayload: json as Prisma.InputJsonValue },
      });
    }

    return {
      orderId: order.id,
      orderNo: order.orderNo,
      linkmePay: json,
    };
  }

  private generateOrderNo(): string {
    const now = new Date();
    const date = now.toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.random().toString(36).slice(2, 10).toUpperCase();
    return `LMP-${date}-${rand}`;
  }

  /** 校验异步通知签名（排除 signature 后对其余字段签名） */
  verifyNotifySignature(
    payload: Record<string, unknown>,
    secretKey: string,
  ): boolean {
    const sig = payload.signature;
    if (typeof sig !== 'string' || !sig) return false;
    const rest = { ...payload };
    delete rest.signature;
    const computed = linkmePaySign(rest, secretKey);
    return computed === sig;
  }

  /**
   * 代收异步通知（Notify Merchant）：`state === 2` 为支付成功；须幂等。
   * 请求体字段见 `LinkmePayCollectNotifyDto` / 渠道文档。
   *
   * @see https://merchant.linkmepay.com/docs/collect.html#notify-merchant
   */
  async handleCollectNotify(
    payload: LinkmePayCollectNotifyPayload,
  ): Promise<{ ack: string }> {
    const bizNo = payload.biz_no;
    if (typeof bizNo !== 'string' || !bizNo.trim()) {
      this.logger.warn('linkmepay notify missing biz_no');
      return { ack: '1' };
    }

    const order = await this.prisma.order.findFirst({
      where: { orderNo: bizNo.trim() },
      include: { app: true },
    });
    if (!order) {
      this.logger.warn(`linkmepay notify unknown biz_no=${bizNo}`);
      return { ack: '1' };
    }

    let cfg: {
      baseUrl: string;
      pid: string;
      secretKey: string;
      defaultAction: string;
      notifyPublicBase: string;
    };
    try {
      const globalSettings = await this.globalIntegration.getSettingsObject();
      cfg = this.parseActiveConfig(globalSettings);
    } catch {
      this.logger.error(`LinkMePay not configured for app ${order.appId}`);
      return { ack: '1' };
    }

    if (!this.verifyNotifySignature(payload, cfg.secretKey)) {
      this.logger.warn(`linkmepay notify bad signature order=${order.id}`);
      throw new BadRequestException('Invalid signature');
    }

    const state = payload.state;
    const stateNum = typeof state === 'number' ? state : Number(state);

    if (stateNum !== 2) {
      if (stateNum === 3 || stateNum === 4) {
        await this.prisma.order.updateMany({
          where: { id: order.id, status: 'pending' },
          data: {
            status: 'failed',
            gatewayPayload: payload as Prisma.InputJsonValue,
          },
        });
      }
      return { ack: '1' };
    }

    if (order.status === 'paid') {
      return { ack: '1' };
    }

    const credits = order.creditsGranted || 0;
    const grantPayg =
      order.type === OrderType.payg || order.type === OrderType.one_time;
    const creditType: CreditType = grantPayg
      ? CreditType.payg
      : CreditType.subscription;

    const paidAt = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: 'paid',
          paidAt,
          gatewayPayload: payload as Prisma.InputJsonValue,
        },
      });

      if (!grantPayg && order.planId) {
        const periodEnd = firstSubscriptionMonthlyExpireUtc(paidAt);
        await tx.subscription.upsert({
          where: {
            appId_userId: { appId: order.appId, userId: order.userId },
          },
          create: {
            appId: order.appId,
            userId: order.userId,
            planId: order.planId,
            status: 'active',
            currentPeriodStart: paidAt,
            currentPeriodEnd: periodEnd,
          },
          update: {
            planId: order.planId,
            status: 'active',
            currentPeriodStart: paidAt,
            currentPeriodEnd: periodEnd,
          },
        });
      }

      if (credits <= 0) return;

      let account = await tx.creditAccount.findUnique({
        where: { userId_appId: { userId: order.userId, appId: order.appId } },
      });
      if (!account) {
        account = await tx.creditAccount.create({
          data: { userId: order.userId, appId: order.appId },
        });
      }

      const balanceField = grantPayg ? 'balancePayg' : 'balanceSub';
      const prevBucket = grantPayg ? account.balancePayg : account.balanceSub;
      const newBucket = prevBucket + credits;

      await tx.creditAccount.update({
        where: { id: account.id },
        data: {
          [balanceField]: { increment: credits },
          totalEarned: { increment: credits },
        },
      });
      await tx.creditTransaction.create({
        data: {
          accountId: account.id,
          appId: order.appId,
          type: 'grant',
          creditType,
          amount: credits,
          balanceAfter: newBucket,
          reason: grantPayg
            ? 'LinkMePay pay-as-you-go purchase'
            : 'LinkMePay subscription purchase',
          referenceId: order.id,
        },
      });
    });

    return { ack: '1' };
  }
}
