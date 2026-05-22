import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreatePlanDto,
  UpdatePlanDto,
  CreateCouponDto,
  UpdatePricingPagePreviewDto,
} from './dto/pricing.dto';

/** Empty / stray numeric 0 must not become the string "0" in DB (optional marketing copy). */
function normalizePlanDescription(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v === 'number') {
    if (v === 0 || Number.isNaN(v)) return null;
    return String(v);
  }
  if (typeof v === 'string') {
    const t = v.trim();
    return t === '' ? null : t;
  }
  return null;
}

/** 支付链接：空串 → null（清空），未传 → undefined（保留旧值） */
function normalizePaymentLink(
  v: string | null | undefined,
): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const t = v.trim();
  return t === '' ? null : t;
}

@Injectable()
export class PricingService {
  constructor(private prisma: PrismaService) {}

  // ── Plans ──────────────────────────────────────────────

  async createPlan(dto: CreatePlanDto) {
    const existing = await this.prisma.pricingPlan.findUnique({
      where: { appId_slug: { appId: dto.appId, slug: dto.slug } },
    });
    if (existing) throw new ConflictException('Plan slug already exists');

    const { metadata, description, sortOrder, paymentLink, ...planRest } = dto;
    let resolvedSort = sortOrder;
    if (resolvedSort === undefined) {
      const agg = await this.prisma.pricingPlan.aggregate({
        where: { appId: dto.appId },
        _max: { sortOrder: true },
      });
      resolvedSort = (agg._max.sortOrder ?? -1) + 1;
    }
    const desc = normalizePlanDescription(description);
    const payLink = normalizePaymentLink(paymentLink);
    return this.prisma.pricingPlan.create({
      data: {
        ...planRest,
        sortOrder: resolvedSort,
        ...(desc !== undefined ? { description: desc } : {}),
        ...(payLink !== undefined ? { paymentLink: payLink } : {}),
        features: (dto.features ?? []) as Prisma.InputJsonValue,
        limits: (dto.limits ?? {}) as Prisma.InputJsonValue,
        ...(metadata !== undefined
          ? { metadata: metadata as Prisma.InputJsonValue }
          : {}),
      },
    });
  }

  async findAllPlans(appId?: string, page = 1, limit = 50) {
    const where = appId ? { appId } : {};
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.pricingPlan.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
        include: { app: { select: { id: true, name: true } } },
      }),
      this.prisma.pricingPlan.count({ where }),
    ]);
    return { data, total, page, limit };
  }

  async findOnePlan(id: string) {
    const plan = await this.prisma.pricingPlan.findUnique({
      where: { id },
      include: { app: { select: { id: true, name: true } } },
    });
    if (!plan) throw new NotFoundException('Plan not found');
    return plan;
  }

  async updatePlan(id: string, dto: UpdatePlanDto) {
    await this.findOnePlan(id);
    const { metadata, description, paymentLink, ...rest } = dto;
    const desc = normalizePlanDescription(description);
    const payLink = normalizePaymentLink(paymentLink);
    return this.prisma.pricingPlan.update({
      where: { id },
      data: {
        ...rest,
        ...(desc !== undefined ? { description: desc } : {}),
        ...(payLink !== undefined ? { paymentLink: payLink } : {}),
        ...(metadata !== undefined
          ? { metadata: metadata as Prisma.InputJsonValue }
          : {}),
      },
    });
  }

  async deletePlan(id: string) {
    await this.findOnePlan(id);
    return this.prisma.pricingPlan.delete({ where: { id } });
  }

  async updateAppPricingPagePreview(
    appId: string,
    dto: UpdatePricingPagePreviewDto,
  ) {
    const app = await this.prisma.application.findUnique({
      where: { id: appId },
    });
    if (!app) throw new NotFoundException('Application not found');

    const prevPage =
      app.pricingPage &&
      typeof app.pricingPage === 'object' &&
      !Array.isArray(app.pricingPage)
        ? (app.pricingPage as Record<string, unknown>)
        : {};

    const patch = Object.fromEntries(
      Object.entries(dto).filter(([, v]) => v !== undefined),
    ) as Record<string, unknown>;

    return this.prisma.application.update({
      where: { id: appId },
      data: {
        pricingPage: { ...prevPage, ...patch } as Prisma.InputJsonValue,
      },
    });
  }

  /** 官网定价页：按应用 slug 返回启用中的方案与 pricingPage 配置（无需登录） */
  async getPublicPricingByAppSlug(slug: string) {
    const app = await this.prisma.application.findUnique({
      where: { slug },
    });
    if (!app) {
      throw new NotFoundException('Application not found');
    }
    const plans = await this.prisma.pricingPlan.findMany({
      where: { appId: app.id, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
    const pricingPage =
      app.pricingPage &&
      typeof app.pricingPage === 'object' &&
      !Array.isArray(app.pricingPage)
        ? app.pricingPage
        : {};

    return {
      app: {
        id: app.id,
        name: app.name,
        slug: app.slug,
      },
      pricingPage,
      plans: plans.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        description: p.description,
        price: Number(p.price),
        currency: p.currency,
        billingInterval: p.billingInterval,
        creditsPerCycle: p.creditsPerCycle,
        features: p.features,
        metadata: p.metadata,
        sortOrder: p.sortOrder,
        paymentLink: p.paymentLink ?? null,
      })),
    };
  }

  // ── Coupons ────────────────────────────────────────────

  async createCoupon(dto: CreateCouponDto) {
    const existing = await this.prisma.coupon.findUnique({
      where: { code: dto.code },
    });
    if (existing) throw new ConflictException('Coupon code already exists');

    return this.prisma.coupon.create({
      data: {
        ...dto,
        validFrom: new Date(dto.validFrom),
        validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
      },
    });
  }

  async findAllCoupons(appId?: string, page = 1, limit = 50) {
    const where = appId ? { appId } : {};
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.coupon.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { app: { select: { id: true, name: true } } },
      }),
      this.prisma.coupon.count({ where }),
    ]);
    return { data, total, page, limit };
  }

  async toggleCoupon(id: string) {
    const coupon = await this.prisma.coupon.findUnique({ where: { id } });
    if (!coupon) throw new NotFoundException('Coupon not found');
    return this.prisma.coupon.update({
      where: { id },
      data: { isActive: !coupon.isActive },
    });
  }
}
