import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  computePeriodEndFromPayment,
  parseGumroadTimestamp,
  pickGumroadPaidAt,
  pickGumroadPeriodEndRaw,
  pickGumroadRecurrence,
} from './gumroad-subscription-period';
import { upsertAinewsPlatformSubscription } from './ainews-subscription.util';
import {
  isDeactivatePing,
  planFromGumroadProduct,
  type PaidPlan,
} from './ainews-tier.util';

type GumroadFields = Record<string, string>;

@Injectable()
export class AinewsGumroadSubscriptionService {
  private readonly logger = new Logger(AinewsGumroadSubscriptionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async upsertFromPing(
    endUserId: string,
    email: string,
    body: GumroadFields,
    deactivate: boolean,
  ): Promise<void> {
    const proId = process.env.GUMROAD_PRODUCT_ID_PRO?.trim() || '';
    const unlimitedId = process.env.GUMROAD_PRODUCT_ID_UNLIMITED?.trim() || '';
    const productId = (body.product_id ?? '').trim();
    const permalink = (
      body.short_product_id ??
      body.product_permalink ??
      body.permalink ??
      ''
    ).trim();
    const plan = planFromGumroadProduct(productId, permalink, proId, unlimitedId);
    if (!plan) {
      this.logger.warn(`Gumroad ping: no ainews plan for product ${productId}`);
      return;
    }

    const recurrence = pickGumroadRecurrence(body);
    const paidAt = pickGumroadPaidAt(body);
    const periodEndRaw = pickGumroadPeriodEndRaw(body);
    const now = new Date();

    let status = deactivate ? 'cancelled' : 'active';
    if (body.refunded === 'true' || body.refunded === '1') {
      status = 'refunded';
    }

    let currentPeriodStart: Date | null = paidAt ? new Date(paidAt) : null;
    let currentPeriodEnd: Date | null = null;
    if (deactivate) {
      const endIso = parseGumroadTimestamp(periodEndRaw) ?? paidAt ?? now.toISOString();
      currentPeriodEnd = new Date(endIso);
      currentPeriodStart = null;
    } else if (paidAt) {
      currentPeriodEnd = new Date(computePeriodEndFromPayment(paidAt, recurrence));
    }

    const ok = await upsertAinewsPlatformSubscription(this.prisma, {
      endUserId,
      plan,
      status,
      deactivate,
      gatewaySubId: body.subscription_id ?? null,
      currentPeriodStart,
      currentPeriodEnd,
    });
    if (!ok) {
      this.logger.warn(
        `Gumroad ping: no pricing_plan for ainews plan=${plan} email=${email}`,
      );
    }
  }

  async upsertPendingFromPing(email: string, body: GumroadFields, deactivate: boolean): Promise<void> {
    const normalized = email.trim().toLowerCase();
    const proId = process.env.GUMROAD_PRODUCT_ID_PRO?.trim() || '';
    const unlimitedId = process.env.GUMROAD_PRODUCT_ID_UNLIMITED?.trim() || '';
    const productId = (body.product_id ?? '').trim();
    const permalink = (
      body.short_product_id ??
      body.product_permalink ??
      body.permalink ??
      ''
    ).trim();
    const plan = planFromGumroadProduct(productId, permalink, proId, unlimitedId) as PaidPlan | null;
    if (!plan) return;

    if (deactivate) {
      await this.prisma.ainewsPendingSubscription.deleteMany({ where: { email: normalized } });
      return;
    }

    const paidAt = pickGumroadPaidAt(body);
    const recurrence = pickGumroadRecurrence(body);
    await this.prisma.ainewsPendingSubscription.upsert({
      where: { email: normalized },
      create: {
        email: normalized,
        plan,
        status: 'active',
        gumroadProductId: productId,
        gumroadSaleId: body.sale_id ?? null,
        gumroadSubscriptionId: body.subscription_id ?? null,
        lastPaidAt: paidAt ? new Date(paidAt) : null,
        currentPeriodStart: paidAt ? new Date(paidAt) : null,
        currentPeriodEnd: paidAt
          ? new Date(computePeriodEndFromPayment(paidAt, recurrence))
          : null,
        recurrence,
        rawPayload: body as unknown as Prisma.InputJsonValue,
      },
      update: {
        plan,
        status: 'active',
        gumroadProductId: productId,
        gumroadSaleId: body.sale_id ?? null,
        gumroadSubscriptionId: body.subscription_id ?? null,
        lastPaidAt: paidAt ? new Date(paidAt) : null,
        currentPeriodStart: paidAt ? new Date(paidAt) : null,
        currentPeriodEnd: paidAt
          ? new Date(computePeriodEndFromPayment(paidAt, recurrence))
          : null,
        recurrence,
        rawPayload: body as unknown as Prisma.InputJsonValue,
        updatedAt: new Date(),
      },
    });
  }

  static parseDeactivate(body: GumroadFields): boolean {
    return isDeactivatePing(body.refunded, body.cancelled, body.subscription_ended_at ?? body.ends_at);
  }
}
