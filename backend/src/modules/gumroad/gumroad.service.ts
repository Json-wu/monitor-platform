import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import {
  BillingInterval,
  CreditType,
  OrderType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { GlobalIntegrationSettingsService } from '../global-integration/global-integration-settings.service';
import {
  readIntegrationsRoot,
  type GumroadIntegration,
} from '../../common/utils/integration-settings.util';
import { firstSubscriptionMonthlyExpireUtc } from '../../common/utils/credit-billing-dates.util';
import { SystemOperationLogService } from '../system-log/system-operation-log.service';

export type GumroadWebhookContext = {
  ipAddress?: string;
  userAgent?: string | null;
  /** Gumroad Ping 原始 body（用于 Supabase 中继，勿 JSON 重组） */
  rawBody?: Buffer;
  contentType?: string;
};

type SupabaseRelayResult = {
  status: number;
  body: string;
  ok: boolean;
};

/**
 * Gumroad Ping 字段（application/x-www-form-urlencoded）。
 * @see https://gumroad.com/ping
 */
type GumroadPingPayload = {
  seller_id?: unknown;
  product_id?: unknown;
  product_permalink?: unknown;
  permalink?: unknown;
  short_product_id?: unknown;
  product_name?: unknown;
  email?: unknown;
  purchaser_email?: unknown;
  subscription_id?: unknown;
  subscription_cancelled_at?: unknown;
  cancelled?: unknown;
  subscription_ended_at?: unknown;
  cancelled_at?: unknown;
  ends_at?: unknown;
  /** 产品 URL 上的自定义查询参数，如 `?user_id=…` → `url_params.user_id` */
  url_params?: unknown;
  /** 产品在 Gumroad 后台配置的自定义字段 */
  custom_fields?: unknown;
  /** 单位为 USD cents（文档）；偶有以小数形式回传 */
  price?: unknown;
  currency?: unknown;
  quantity?: unknown;
  order_number?: unknown;
  sale_id?: unknown;
  sale_timestamp?: unknown;
  refunded?: unknown;
  disputed?: unknown;
  dispute_won?: unknown;
  test?: unknown;
};

function asString(v: unknown): string {
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return '';
}

function asInt(v: unknown, fallback = 0): number {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isFinite(n)) return Math.trunc(n);
  }
  return fallback;
}

function isNonEmptyField(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  return true;
}

function isTruthyFlag(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v === 1;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    return s === '1' || s === 'true' || s === 'yes' || s === 'on';
  }
  return false;
}

/** Gumroad 常以 JSON 字符串或嵌套 form 字段回传 `url_params` / `custom_fields` */
function parseGumroadDict(v: unknown): Record<string, string> {
  let raw: unknown = v;
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t) return {};
    try {
      raw = JSON.parse(t) as unknown;
    } catch {
      return {};
    }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(raw as Record<string, unknown>)) {
    const s = asString(val);
    if (s) out[k] = s;
  }
  return out;
}

/** 从 Ping 的 url_params / custom_fields 解析站内用户 UUID（营销站链接追加 `user_id`） */
function extractEndUserIdFromPing(payload: GumroadPingPayload): string {
  const keys = ['user_id', 'userid', 'userId'];
  for (const bag of [
    parseGumroadDict(payload.url_params),
    parseGumroadDict(payload.custom_fields),
  ]) {
    for (const key of keys) {
      const id = bag[key]?.trim();
      if (id) return id;
    }
  }
  return '';
}

@Injectable()
export class GumroadService {
  private readonly logger = new Logger(GumroadService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly globalIntegration: GlobalIntegrationSettingsService,
    private readonly systemLog: SystemOperationLogService,
  ) {}

  private pingMeta(payload: GumroadPingPayload): Prisma.InputJsonValue {
    return {
      seller_id: asString(payload.seller_id),
      sale_id: asString(payload.sale_id),
      email: asString(payload.email),
      product_id: asString(payload.product_id),
      permalink: asString(payload.permalink),
      product_permalink: asString(payload.product_permalink),
      url_params: parseGumroadDict(payload.url_params),
      custom_fields: parseGumroadDict(payload.custom_fields),
      end_user_id: extractEndUserIdFromPing(payload) || undefined,
      price: payload.price,
      quantity: payload.quantity,
      refunded: payload.refunded,
      disputed: payload.disputed,
      test: payload.test,
    } as Prisma.InputJsonValue;
  }

  private async recordPingLog(
    ctx: GumroadWebhookContext | undefined,
    input: {
      appId?: string | null;
      action: string;
      targetId: string;
      summary: string;
      metadata?: Prisma.InputJsonValue;
    },
  ): Promise<void> {
    await this.systemLog.recordAutomationEvent({
      appId: input.appId,
      module: 'gumroad',
      action: input.action,
      targetType: 'gumroad_ping',
      targetId: input.targetId,
      summary: input.summary,
      metadata: input.metadata,
      ipAddress: ctx?.ipAddress,
      userAgent: ctx?.userAgent,
    });
  }

  /** 读取「全站集成 → gumroad」配置；未启用或缺失 sellerId 直接返回 null */
  private async readGumroadConfig(): Promise<GumroadIntegration | null> {
    const settings = await this.globalIntegration.getSettingsObject();
    const root = readIntegrationsRoot(settings);
    const gum = root.gumroad;
    if (!gum || typeof gum !== 'object') return null;
    if (gum.enabled === false) return null;
    return gum;
  }

  /**
   * 处理 Gumroad Ping：
   * 1. 校验 seller_id 与全站集成一致；
   * 2. 按 `permalink` / `product_permalink` 在 `PricingPlan.paymentLink` 中匹配到方案；
   * 3. 在该方案所属 application 下解析终端用户：优先 `url_params.user_id`（或 `userid`），否则按 email；
   * 4. 幂等创建订单（orderNo = `GUM-{sale_id}`）并发放对应积分。
   */
  async handlePing(
    payload: GumroadPingPayload,
    ctx?: GumroadWebhookContext,
  ): Promise<{ ack: string }> {
    const saleIdRaw = asString(payload.sale_id) || 'unknown';
    const meta = () => this.pingMeta(payload);

    const cfg = await this.readGumroadConfig();
    const expectSellerId = cfg?.sellerId?.trim();
    if (!expectSellerId) {
      this.logger.warn('Gumroad integration not configured (sellerId missing)');
      await this.recordPingLog(ctx, {
        action: 'webhook_rejected',
        targetId: saleIdRaw,
        summary: 'Gumroad Ping 拒绝：未配置 sellerId',
        metadata: meta(),
      });
      throw new BadRequestException('Gumroad integration is not configured');
    }
    const incomingSellerId = asString(payload.seller_id);
    if (!incomingSellerId || incomingSellerId !== expectSellerId) {
      this.logger.warn(
        `Gumroad ping seller_id mismatch (got=${incomingSellerId})`,
      );
      await this.recordPingLog(ctx, {
        action: 'webhook_rejected',
        targetId: saleIdRaw,
        summary: `Gumroad Ping 拒绝：seller_id 不匹配 (${incomingSellerId || 'empty'})`,
        metadata: meta(),
      });
      throw new UnauthorizedException('seller_id mismatch');
    }

    // 退款/争议/测试：当前实现仅记录，不做实际发放
    if (
      isTruthyFlag(payload.refunded) ||
      isTruthyFlag(payload.disputed) ||
      isTruthyFlag(payload.dispute_won)
    ) {
      this.logger.log(
        `Gumroad ping skipped (refund/dispute) sale_id=${asString(payload.sale_id)}`,
      );
      await this.recordPingLog(ctx, {
        action: 'webhook_skipped',
        targetId: saleIdRaw,
        summary: 'Gumroad Ping 已跳过：退款或争议',
        metadata: meta(),
      });
      return { ack: 'ok' };
    }
    if (isTruthyFlag(payload.test)) {
      this.logger.log(
        `Gumroad test ping accepted sale_id=${asString(payload.sale_id)}`,
      );
    }

    const email = this.extractBuyerEmail(payload);
    if (!email || !email.includes('@')) {
      this.logger.warn('Gumroad ping missing email');
      await this.recordPingLog(ctx, {
        action: 'webhook_rejected',
        targetId: saleIdRaw,
        summary: 'Gumroad Ping 拒绝：缺少有效 email',
        metadata: meta(),
      });
      throw new BadRequestException('email is required');
    }

    if (this.isAinewsRelayProduct(payload)) {
      return this.handleAinewsRelayPing(payload, email, ctx);
    }

    const plan = await this.matchPlan(payload);
    if (!plan) {
      this.logger.warn(
        `Gumroad ping no matching plan (permalink=${asString(
          payload.permalink,
        )} product_permalink=${asString(payload.product_permalink)})`,
      );
      await this.recordPingLog(ctx, {
        action: 'webhook_rejected',
        targetId: saleIdRaw,
        summary: `Gumroad Ping 拒绝：无匹配定价方案 (${email})`,
        metadata: meta(),
      });
      throw new BadRequestException('No matching pricing plan');
    }

    const user = await this.resolveEndUser(plan.appId, payload, email);
    if (!user) {
      const endUserIdHint = extractEndUserIdFromPing(payload);
      this.logger.warn(
        `Gumroad ping user not found app=${plan.appId} email=${email} user_id=${endUserIdHint || '—'}`,
      );
      await this.recordPingLog(ctx, {
        appId: plan.appId,
        action: 'webhook_rejected',
        targetId: saleIdRaw,
        summary: endUserIdHint
          ? `Gumroad Ping 拒绝：未找到用户 (user_id=${endUserIdHint})`
          : `Gumroad Ping 拒绝：未找到用户 ${email}`,
        metadata: { ...meta() as object, planId: plan.id },
      });
      throw new BadRequestException('End user not found for this application');
    }

    const saleId = asString(payload.sale_id);
    const orderNo = saleId
      ? `GUM-${saleId}`
      : `GUM-${Date.now().toString(36).toUpperCase()}-${Math.random()
          .toString(36)
          .slice(2, 8)
          .toUpperCase()}`;

    // 幂等：相同 sale_id 重复回调直接 ack
    const existing = await this.prisma.order.findUnique({ where: { orderNo } });
    if (existing && existing.status === 'paid') {
      await this.recordPingLog(ctx, {
        appId: plan.appId,
        action: 'webhook_duplicate',
        targetId: orderNo,
        summary: `Gumroad Ping 重复回调（已支付）${orderNo} · ${email}`,
        metadata: {
          ...meta() as object,
          userId: user.id,
          planId: plan.id,
          orderId: existing.id,
        },
      });
      return { ack: 'ok' };
    }

    const quantity = Math.max(1, asInt(payload.quantity, 1));
    const grantPayg = plan.billingInterval === BillingInterval.one_time;
    const creditsTotal = (plan.creditsPerCycle ?? 0) * quantity;
    const creditType: CreditType = grantPayg
      ? CreditType.payg
      : CreditType.subscription;
    const orderType: OrderType = grantPayg
      ? OrderType.payg
      : OrderType.subscription;

    // 金额：Gumroad 多以「分」回传；这里只用作记账金额，不影响发放
    const priceRaw = asInt(payload.price, 0);
    const amount = priceRaw > 0 ? priceRaw / 100 : Number(plan.price) * quantity;
    const currency =
      asString(payload.currency).toUpperCase() || plan.currency || 'USD';

    const paidAt = new Date();

    await this.prisma.$transaction(async (tx) => {
      const order = existing
        ? await tx.order.update({
            where: { id: existing.id },
            data: {
              status: 'paid',
              paidAt,
              gatewayPayload: payload as unknown as Prisma.InputJsonValue,
              creditsGranted: creditsTotal,
            },
          })
        : await tx.order.create({
            data: {
              appId: plan.appId,
              userId: user.id,
              orderNo,
              type: orderType,
              status: 'paid',
              amount: new Prisma.Decimal(amount.toFixed(2)),
              currency,
              planId: plan.id,
              creditsGranted: creditsTotal,
              gateway: 'gumroad',
              gatewayOrderId: asString(payload.order_number) || undefined,
              gatewayPayload: payload as unknown as Prisma.InputJsonValue,
              paidAt,
            },
          });

      if (!grantPayg) {
        const periodEnd = firstSubscriptionMonthlyExpireUtc(paidAt);
        await tx.subscription.upsert({
          where: { appId_userId: { appId: plan.appId, userId: user.id } },
          create: {
            appId: plan.appId,
            userId: user.id,
            planId: plan.id,
            status: 'active',
            currentPeriodStart: paidAt,
            currentPeriodEnd: periodEnd,
          },
          update: {
            planId: plan.id,
            status: 'active',
            currentPeriodStart: paidAt,
            currentPeriodEnd: periodEnd,
          },
        });
      }

      if (creditsTotal <= 0) return;

      let account = await tx.creditAccount.findUnique({
        where: { userId_appId: { userId: user.id, appId: plan.appId } },
      });
      if (!account) {
        account = await tx.creditAccount.create({
          data: { userId: user.id, appId: plan.appId },
        });
      }
      const balanceField = grantPayg ? 'balancePayg' : 'balanceSub';
      const prevBucket = grantPayg ? account.balancePayg : account.balanceSub;
      const newBucket = prevBucket + creditsTotal;

      await tx.creditAccount.update({
        where: { id: account.id },
        data: {
          [balanceField]: { increment: creditsTotal },
          totalEarned: { increment: creditsTotal },
        },
      });
      await tx.creditTransaction.create({
        data: {
          accountId: account.id,
          appId: plan.appId,
          type: 'grant',
          creditType,
          amount: creditsTotal,
          balanceAfter: newBucket,
          reason: grantPayg
            ? 'Gumroad pay-as-you-go purchase'
            : 'Gumroad subscription purchase',
          referenceId: order.id,
        },
      });
    });

    const actionLabel = isTruthyFlag(payload.test) ? 'webhook_test_paid' : 'webhook_paid';
    await this.recordPingLog(ctx, {
      appId: plan.appId,
      action: actionLabel,
      targetId: orderNo,
      summary: `Gumroad Ping 支付成功：${orderNo} · ${email} · +${creditsTotal} credits`,
      metadata: {
        ...meta() as object,
        userId: user.id,
        planId: plan.id,
        planName: plan.name,
        creditsGranted: creditsTotal,
        orderType,
        quantity,
        amount,
        currency,
      },
    });

    return { ack: 'ok' };
  }

  /** 优先 url_params / custom_fields 中的 user_id，否则按买家 email 匹配 */
  private async resolveEndUser(
    appId: string,
    payload: GumroadPingPayload,
    email: string,
  ) {
    const byId = extractEndUserIdFromPing(payload);
    if (byId) {
      const u = await this.prisma.endUser.findFirst({
        where: { appId, id: byId, status: 'active' },
        select: { id: true, email: true, appId: true },
      });
      if (u) return u;
    }
    return this.prisma.endUser.findFirst({
      where: {
        appId,
        email: { equals: email, mode: 'insensitive' },
        status: 'active',
      },
      select: { id: true, email: true, appId: true },
    });
  }

  /**
   * 匹配方案：依次尝试用 `permalink` / `product_permalink` 在 `PricingPlan.paymentLink`
   * 中做包含匹配；都失败时返回 null。
   *
   * 设计：Gumroad ping 中 `permalink` 通常是产品短标识（如 `abcde`），
   * `product_permalink` 是产品完整页面 URL；管理后台填入 paymentLink 时通常用 URL，
   * 包含上述 `permalink`，因此「contains」即可精确匹配单个产品。
   */
  private async matchPlan(payload: GumroadPingPayload) {
    const candidates = [
      asString(payload.product_permalink),
      asString(payload.permalink),
      asString(payload.short_product_id),
      asString(payload.product_id),
    ].filter((s) => s.length > 0);

    for (const term of candidates) {
      const plan = await this.prisma.pricingPlan.findFirst({
        where: {
          isActive: true,
          paymentLink: { contains: term, mode: 'insensitive' },
        },
      });
      if (plan) return plan;
    }
    return null;
  }

  private extractBuyerEmail(payload: GumroadPingPayload): string {
    const email =
      asString(payload.email) || asString(payload.purchaser_email);
    return email.toLowerCase();
  }

  private ainewsProductNeedles(): string[] {
    const pro =
      process.env.GUMROAD_PRODUCT_ID_PRO?.trim() || 'industry-ai-news-pro';
    const unlimited =
      process.env.GUMROAD_PRODUCT_ID_UNLIMITED?.trim() ||
      'industry-ai-news-unlimited';
    return [pro, unlimited];
  }

  private isAinewsRelayProduct(payload: GumroadPingPayload): boolean {
    const needles = this.ainewsProductNeedles().map((n) => n.toLowerCase());
    const candidates = [
      asString(payload.product_id),
      asString(payload.product_permalink),
      asString(payload.permalink),
      asString(payload.short_product_id),
    ].filter((s) => s.length > 0);
    for (const term of candidates) {
      const lower = term.toLowerCase();
      if (needles.some((n) => lower.includes(n))) return true;
    }
    return false;
  }

  private isGumroadCancellation(payload: GumroadPingPayload): boolean {
    if (isTruthyFlag(payload.refunded)) return true;
    if (
      isNonEmptyField(payload.subscription_cancelled_at) ||
      isTruthyFlag(payload.cancelled)
    ) {
      return true;
    }
    return (
      isNonEmptyField(payload.subscription_ended_at) ||
      isNonEmptyField(payload.cancelled_at) ||
      isNonEmptyField(payload.ends_at)
    );
  }

  private async resolveAinewsApplication() {
    const slug =
      process.env.GUMROAD_AINEWS_APP_SLUG?.trim() || 'chrome-ainews';
    const app = await this.prisma.application.findUnique({
      where: { slug },
      select: { id: true, slug: true },
    });
    if (!app) {
      throw new BadRequestException(
        `Application not found for slug: ${slug}`,
      );
    }
    return app;
  }

  private async matchPlanForApp(
    appId: string,
    payload: GumroadPingPayload,
  ) {
    const candidates = [
      asString(payload.product_permalink),
      asString(payload.permalink),
      asString(payload.short_product_id),
      asString(payload.product_id),
    ].filter((s) => s.length > 0);

    for (const term of candidates) {
      const plan = await this.prisma.pricingPlan.findFirst({
        where: {
          appId,
          isActive: true,
          paymentLink: { contains: term, mode: 'insensitive' },
        },
      });
      if (plan) return plan;
    }
    return null;
  }

  private async findOrCreateEndUserByEmail(appId: string, email: string) {
    const existing = await this.prisma.endUser.findUnique({
      where: { appId_email: { appId, email } },
      select: { id: true, email: true, appId: true },
    });
    if (existing && existing.appId === appId) return existing;

    const name = email.split('@')[0] || 'User';
    return this.prisma.$transaction(async (tx) => {
      const u = await tx.endUser.create({
        data: {
          appId,
          email,
          name,
          emailVerifiedAt: new Date(),
          status: 'active',
        },
        select: { id: true, email: true, appId: true },
      });
      await tx.creditAccount.create({
        data: { userId: u.id, appId },
      });
      return u;
    });
  }

  private buildRelayRawBody(
    payload: GumroadPingPayload,
    ctx?: GumroadWebhookContext,
  ): Buffer {
    if (ctx?.rawBody && ctx.rawBody.length > 0) return ctx.rawBody;
    this.logger.warn(
      'Gumroad relay: rawBody missing, falling back to urlencoded serialize',
    );
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(
      payload as Record<string, unknown>,
    )) {
      if (v == null) continue;
      if (typeof v === 'object') {
        params.set(k, JSON.stringify(v));
      } else {
        params.set(k, asString(v) || String(v));
      }
    }
    return Buffer.from(params.toString(), 'utf8');
  }

  private async forwardToSupabaseGumroadWebhook(
    rawBody: Buffer,
    contentType?: string,
  ): Promise<SupabaseRelayResult | null> {
    const url = process.env.SUPABASE_GUMROAD_WEBHOOK_URL?.trim();
    if (!url) {
      this.logger.warn(
        'SUPABASE_GUMROAD_WEBHOOK_URL not set; skipping ainews relay forward',
      );
      return null;
    }

    const anonKey = process.env.SUPABASE_ANON_KEY?.trim();
    const secret = process.env.GUMROAD_WEBHOOK_SECRET?.trim();
    const headers: Record<string, string> = {
      'Content-Type':
        contentType?.trim() || 'application/x-www-form-urlencoded',
    };
    if (anonKey) {
      headers.apikey = anonKey;
      headers.Authorization = `Bearer ${anonKey}`;
    }
    if (secret) headers['x-gumroad-signature'] = secret;

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers,
        body: new Uint8Array(rawBody),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Gumroad ainews relay fetch failed: ${msg}`);
      return { status: 0, body: msg, ok: false };
    }

    const body = await res.text();
    let upstreamOk = res.ok;
    if (res.ok) {
      try {
        const parsed = JSON.parse(body) as { ok?: unknown };
        upstreamOk = parsed.ok === true;
      } catch {
        upstreamOk = false;
      }
    }
    return { status: res.status, body, ok: upstreamOk };
  }

  /**
   * industry-ai-news-pro / unlimited：原样转发 Supabase Edge，并在 chrome-ainews 下按邮箱建用户、建订单。
   */
  private async handleAinewsRelayPing(
    payload: GumroadPingPayload,
    email: string,
    ctx?: GumroadWebhookContext,
  ): Promise<{ ack: string }> {
    const saleIdRaw = asString(payload.sale_id) || 'unknown';
    const meta = () => this.pingMeta(payload);
    const rawBody = this.buildRelayRawBody(payload, ctx);

    const relay = await this.forwardToSupabaseGumroadWebhook(
      rawBody,
      ctx?.contentType,
    );
    if (relay) {
      if (relay.ok) {
        this.logger.log(
          `Gumroad ainews relay ok status=${relay.status} sale_id=${saleIdRaw}`,
        );
      } else if (relay.status >= 400 && relay.status < 500) {
        this.logger.warn(
          `Gumroad ainews relay client error status=${relay.status} body=${relay.body.slice(0, 500)}`,
        );
      } else {
        this.logger.error(
          `Gumroad ainews relay failed status=${relay.status} body=${relay.body.slice(0, 500)}`,
        );
      }
      await this.recordPingLog(ctx, {
        action: relay.ok ? 'ainews_relay_ok' : 'ainews_relay_failed',
        targetId: saleIdRaw,
        summary: relay.ok
          ? `AI News Gumroad 已中继至 Supabase (${email})`
          : `AI News Gumroad 中继失败 HTTP ${relay.status}`,
        metadata: {
          ...meta() as object,
          relayStatus: relay.status,
          relayBody: relay.body.slice(0, 2000),
        },
      });
    }

    const app = await this.resolveAinewsApplication();
    const plan = await this.matchPlanForApp(app.id, payload);
    if (!plan) {
      this.logger.warn(
        `Gumroad ainews ping no matching plan app=${app.slug} email=${email}`,
      );
      await this.recordPingLog(ctx, {
        appId: app.id,
        action: 'webhook_rejected',
        targetId: saleIdRaw,
        summary: `AI News Gumroad 拒绝：无匹配定价方案 (${email})`,
        metadata: meta(),
      });
      throw new BadRequestException('No matching pricing plan');
    }

    if (this.isGumroadCancellation(payload)) {
      await this.applyAinewsCancellation(app.id, payload, email, ctx);
      return { ack: 'ok' };
    }

    if (isTruthyFlag(payload.disputed) || isTruthyFlag(payload.dispute_won)) {
      this.logger.log(
        `Gumroad ainews ping skipped (dispute) sale_id=${asString(payload.sale_id)}`,
      );
      return { ack: 'ok' };
    }

    const user = await this.findOrCreateEndUserByEmail(app.id, email);
    const saleId = asString(payload.sale_id);
    const orderNo = saleId
      ? `GUM-${saleId}`
      : `GUM-${Date.now().toString(36).toUpperCase()}-${Math.random()
          .toString(36)
          .slice(2, 8)
          .toUpperCase()}`;

    const existing = await this.prisma.order.findUnique({ where: { orderNo } });
    if (existing?.status === 'paid') {
      await this.recordPingLog(ctx, {
        appId: app.id,
        action: 'webhook_duplicate',
        targetId: orderNo,
        summary: `AI News Gumroad 重复回调（已支付）${orderNo} · ${email}`,
        metadata: {
          ...meta() as object,
          userId: user.id,
          planId: plan.id,
          orderId: existing.id,
        },
      });
      return { ack: 'ok' };
    }

    const quantity = Math.max(1, asInt(payload.quantity, 1));
    const grantPayg = plan.billingInterval === BillingInterval.one_time;
    const creditsTotal = (plan.creditsPerCycle ?? 0) * quantity;
    const creditType: CreditType = grantPayg
      ? CreditType.payg
      : CreditType.subscription;
    const orderType: OrderType = grantPayg
      ? OrderType.payg
      : OrderType.subscription;
    const priceRaw = asInt(payload.price, 0);
    const amount = priceRaw > 0 ? priceRaw / 100 : Number(plan.price) * quantity;
    const currency =
      asString(payload.currency).toUpperCase() || plan.currency || 'USD';
    const paidAt = new Date();
    const gatewaySubId = asString(payload.subscription_id) || undefined;

    await this.prisma.$transaction(async (tx) => {
      const order = existing
        ? await tx.order.update({
            where: { id: existing.id },
            data: {
              status: 'paid',
              paidAt,
              gatewayPayload: payload as unknown as Prisma.InputJsonValue,
              creditsGranted: creditsTotal,
              gatewayOrderId: asString(payload.order_number) || undefined,
            },
          })
        : await tx.order.create({
            data: {
              appId: app.id,
              userId: user.id,
              orderNo,
              type: orderType,
              status: 'paid',
              amount: new Prisma.Decimal(amount.toFixed(2)),
              currency,
              planId: plan.id,
              creditsGranted: creditsTotal,
              gateway: 'gumroad',
              gatewayOrderId: asString(payload.order_number) || undefined,
              gatewayPayload: payload as unknown as Prisma.InputJsonValue,
              paidAt,
            },
          });

      if (!grantPayg) {
        const periodEnd = firstSubscriptionMonthlyExpireUtc(paidAt);
        await tx.subscription.upsert({
          where: { appId_userId: { appId: app.id, userId: user.id } },
          create: {
            appId: app.id,
            userId: user.id,
            planId: plan.id,
            status: 'active',
            gatewaySubId,
            currentPeriodStart: paidAt,
            currentPeriodEnd: periodEnd,
          },
          update: {
            planId: plan.id,
            status: 'active',
            gatewaySubId: gatewaySubId ?? undefined,
            currentPeriodStart: paidAt,
            currentPeriodEnd: periodEnd,
          },
        });
      }

      if (creditsTotal <= 0) return;

      let account = await tx.creditAccount.findUnique({
        where: { userId_appId: { userId: user.id, appId: app.id } },
      });
      if (!account) {
        account = await tx.creditAccount.create({
          data: { userId: user.id, appId: app.id },
        });
      }
      const balanceField = grantPayg ? 'balancePayg' : 'balanceSub';
      const prevBucket = grantPayg ? account.balancePayg : account.balanceSub;
      const newBucket = prevBucket + creditsTotal;

      await tx.creditAccount.update({
        where: { id: account.id },
        data: {
          [balanceField]: { increment: creditsTotal },
          totalEarned: { increment: creditsTotal },
        },
      });
      await tx.creditTransaction.create({
        data: {
          accountId: account.id,
          appId: app.id,
          type: 'grant',
          creditType,
          amount: creditsTotal,
          balanceAfter: newBucket,
          reason: grantPayg
            ? 'Gumroad pay-as-you-go purchase (AI News)'
            : 'Gumroad subscription purchase (AI News)',
          referenceId: order.id,
        },
      });
    });

    const actionLabel = isTruthyFlag(payload.test)
      ? 'webhook_test_paid'
      : 'webhook_paid';
    await this.recordPingLog(ctx, {
      appId: app.id,
      action: actionLabel,
      targetId: orderNo,
      summary: `AI News Gumroad 支付成功：${orderNo} · ${email} · +${creditsTotal} credits`,
      metadata: {
        ...meta() as object,
        userId: user.id,
        planId: plan.id,
        planName: plan.name,
        creditsGranted: creditsTotal,
        relayOk: relay?.ok ?? null,
      },
    });

    return { ack: 'ok' };
  }

  private async applyAinewsCancellation(
    appId: string,
    payload: GumroadPingPayload,
    email: string,
    ctx?: GumroadWebhookContext,
  ): Promise<void> {
    const saleId = asString(payload.sale_id);
    const orderNo = saleId ? `GUM-${saleId}` : null;
    const now = new Date();
    const orderStatus = isTruthyFlag(payload.refunded)
      ? ('refunded' as const)
      : ('cancelled' as const);

    const user = await this.prisma.endUser.findUnique({
      where: { appId_email: { appId, email } },
      select: { id: true },
    });

    if (orderNo) {
      const order = await this.prisma.order.findUnique({ where: { orderNo } });
      if (order && order.appId === appId) {
        await this.prisma.order.update({
          where: { id: order.id },
          data: {
            status: orderStatus,
            refundedAt: orderStatus === 'refunded' ? now : undefined,
            gatewayPayload: payload as unknown as Prisma.InputJsonValue,
          },
        });
      }
    }

    if (user) {
      await this.prisma.subscription.updateMany({
        where: { appId, userId: user.id, status: 'active' },
        data: { status: 'cancelled', cancelAt: now },
      });
    }

    await this.recordPingLog(ctx, {
      appId,
      action: 'ainews_cancelled',
      targetId: orderNo ?? email,
      summary: `AI News Gumroad 取消/退款：${email}`,
      metadata: this.pingMeta(payload),
    });
  }
}
