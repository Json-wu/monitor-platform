import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma, SubStatus, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { OAuth2Client } from 'google-auth-library';
import { PrismaService } from '../../prisma/prisma.service';
import {
  generateEndUserApiKey,
  maskEndUserApiKey,
} from '../../common/utils/end-user-api-key.util';
import { NotificationService } from '../notification/notification.service';
import {
  CompleteRegisterDto,
  EndUserLoginDto,
  GoogleIdTokenDto,
  SendRegisterCodeDto,
  VerifyRegisterCodeDto,
} from './dto/public-end-user-auth.dto';

const CODE_TTL_MS = 10 * 60 * 1000;
const SEND_COOLDOWN_MS = 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;
const SALT_ROUNDS = 12;

type RegistrationJwtPayload = {
  typ: 'registration';
  email: string;
  appId: string;
};

type AccessJwtPayload = {
  typ: 'end_user';
  sub: string;
  email: string;
  appId: string;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toIsoOrNull(d: Date | null | undefined): string | null {
  if (!d) return null;
  const t = d.getTime();
  if (Number.isNaN(t)) return null;
  return d.toISOString();
}

function assertPasswordStrength(password: string): void {
  if (password.length < 8) {
    throw new BadRequestException('Password must be at least 8 characters');
  }
  let score = 0;
  if (/[a-z]/.test(password)) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  if (score < 3) {
    throw new BadRequestException(
      'Password must include at least three of: uppercase, lowercase, numbers, and symbols',
    );
  }
}

@Injectable()
export class PublicEndUserAuthService {
  private readonly logger = new Logger(PublicEndUserAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
    private readonly jwt: JwtService,
  ) {}

  private async findAppBySlug(slug: string) {
    const s = slug?.trim();
    if (!s) throw new BadRequestException('Application slug is required');
    const app = await this.prisma.application.findUnique({
      where: { slug: s },
    });
    if (!app) throw new BadRequestException('Application not found');
    if (app.status !== 'active')
      throw new BadRequestException('Application is not available');
    return app;
  }

  async sendRegisterCode(slug: string, dto: SendRegisterCodeDto) {
    const app = await this.findAppBySlug(slug);
    const email = normalizeEmail(dto.email);

    const existing = await this.prisma.endUser.findUnique({
      where: { appId_email: { appId: app.id, email } },
    });
    if (existing) {
      throw new BadRequestException(
        'This email is already registered. Please sign in.',
      );
    }

    const recent = await this.prisma.emailVerificationCode.findFirst({
      where: { appId: app.id, email, purpose: 'register', consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (recent && Date.now() - recent.createdAt.getTime() < SEND_COOLDOWN_MS) {
      throw new HttpException(
        'Too many requests. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = await bcrypt.hash(code, SALT_ROUNDS);

    await this.prisma.emailVerificationCode.deleteMany({
      where: {
        appId: app.id,
        email,
        purpose: 'register',
        consumedAt: null,
      },
    });

    await this.prisma.emailVerificationCode.create({
      data: {
        appId: app.id,
        email,
        codeHash,
        purpose: 'register',
        expiresAt: new Date(Date.now() + CODE_TTL_MS),
      },
    });

    await this.notifications.sendRegisterVerificationEmail({
      appId: app.id,
      appName: app.name,
      to: email,
      code,
      expiryMinutes: Math.floor(CODE_TTL_MS / 60_000),
    });
    return { sent: true };
  }

  async verifyRegisterCode(slug: string, dto: VerifyRegisterCodeDto) {
    const app = await this.findAppBySlug(slug);
    const email = normalizeEmail(dto.email);

    const row = await this.prisma.emailVerificationCode.findFirst({
      where: {
        appId: app.id,
        email,
        purpose: 'register',
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!row) {
      throw new BadRequestException(
        'Verification code is invalid or has expired',
      );
    }

    if (row.attempts >= MAX_CODE_ATTEMPTS) {
      throw new BadRequestException(
        'Too many attempts. Please request a new verification code.',
      );
    }

    const ok = await bcrypt.compare(dto.code, row.codeHash);
    if (!ok) {
      await this.prisma.emailVerificationCode.update({
        where: { id: row.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException('Invalid verification code');
    }

    await this.prisma.emailVerificationCode.update({
      where: { id: row.id },
      data: { consumedAt: new Date() },
    });

    const registrationToken = await this.jwt.signAsync(
      {
        typ: 'registration',
        email,
        appId: app.id,
      } satisfies RegistrationJwtPayload,
      { expiresIn: '15m' },
    );

    return { registrationToken };
  }

  async completeRegister(slug: string, dto: CompleteRegisterDto) {
    const app = await this.findAppBySlug(slug);
    if (!dto.acceptTerms) {
      throw new BadRequestException(
        'You must accept the Terms of Service and Privacy Policy',
      );
    }
    if (dto.password !== dto.passwordConfirm) {
      throw new BadRequestException('Passwords do not match');
    }
    assertPasswordStrength(dto.password);

    let payload: RegistrationJwtPayload;
    try {
      payload = await this.jwt.verifyAsync<RegistrationJwtPayload>(
        dto.registrationToken,
      );
    } catch {
      throw new BadRequestException(
        'Registration session expired. Please verify your email again.',
      );
    }

    if (payload.typ !== 'registration' || payload.appId !== app.id) {
      throw new BadRequestException('Invalid registration token');
    }

    const email = normalizeEmail(payload.email);
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Please enter a display name');

    const existing = await this.prisma.endUser.findUnique({
      where: { appId_email: { appId: app.id, email } },
    });
    if (existing) {
      throw new BadRequestException(
        'This email is already registered. Please sign in.',
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    const user = await this.prisma.$transaction(async (tx) => {
      const u = await tx.endUser.create({
        data: {
          appId: app.id,
          email,
          name,
          passwordHash,
          emailVerifiedAt: new Date(),
          status: UserStatus.active,
        },
      });
      await tx.creditAccount.create({
        data: { userId: u.id, appId: app.id },
      });
      return u;
    });

    const access_token = await this.signAccessToken(user.id, email, app.id);
    return {
      access_token,
      user: await this.buildPublicEndUserProfile(user.id),
    };
  }

  async login(slug: string, dto: EndUserLoginDto) {
    const app = await this.findAppBySlug(slug);
    const email = normalizeEmail(dto.email);

    const user = await this.prisma.endUser.findUnique({
      where: { appId_email: { appId: app.id, email } },
    });

    const invalid = new UnauthorizedException('Invalid email or password');

    if (!user || user.status !== UserStatus.active) {
      throw invalid;
    }
    if (!user.passwordHash) {
      throw new UnauthorizedException(
        'This account has no password. Please use Google sign-in.',
      );
    }

    const match = await bcrypt.compare(dto.password, user.passwordHash);
    if (!match) throw invalid;

    await this.prisma.endUser.update({
      where: { id: user.id },
      data: { lastActiveAt: new Date() },
    });

    const access_token = await this.signAccessToken(user.id, email, app.id);
    return {
      access_token,
      user: await this.buildPublicEndUserProfile(user.id),
    };
  }

  async googleLogin(slug: string, dto: GoogleIdTokenDto) {
    const app = await this.findAppBySlug(slug);
    const audience = app.googleClientId?.trim();
    if (!audience) {
      throw new BadRequestException(
        'Google sign-in is not configured for this application',
      );
    }
    const client = new OAuth2Client(audience);

    let gp: {
      email?: string;
      sub?: string;
      name?: string;
      picture?: string;
    };
    try {
      const ticket = await client.verifyIdToken({
        idToken: dto.idToken,
        audience,
      });
      const p = ticket.getPayload();
      if (!p?.email || !p.sub) throw new Error('missing claims');
      gp = p;
    } catch {
      throw new UnauthorizedException('Google sign-in verification failed');
    }

    const email = normalizeEmail(gp.email!);
    const oauthId = gp.sub;
    const avatarUrl = gp.picture ?? null;
    const name =
      (gp.name && gp.name.trim()) || gp.email!.split('@')[0] || 'User';

    let user = await this.prisma.endUser.findFirst({
      where: {
        appId: app.id,
        oauthProvider: 'google',
        oauthId,
      },
    });

    if (!user) {
      const byEmail = await this.prisma.endUser.findUnique({
        where: { appId_email: { appId: app.id, email } },
      });
      if (byEmail) {
        if (byEmail.oauthProvider && byEmail.oauthProvider !== 'google') {
          throw new BadRequestException(
            'This email is registered with a different sign-in method',
          );
        }
        user = await this.prisma.endUser.update({
          where: { id: byEmail.id },
          data: {
            oauthProvider: 'google',
            oauthId,
            avatarUrl: avatarUrl ?? byEmail.avatarUrl,
            name: byEmail.name || name,
            emailVerifiedAt: byEmail.emailVerifiedAt ?? new Date(),
            lastActiveAt: new Date(),
          },
        });
      } else {
        user = await this.prisma.$transaction(async (tx) => {
          const u = await tx.endUser.create({
            data: {
              appId: app.id,
              email,
              name,
              avatarUrl,
              oauthProvider: 'google',
              oauthId,
              emailVerifiedAt: new Date(),
              status: UserStatus.active,
            },
          });
          await tx.creditAccount.create({
            data: { userId: u.id, appId: app.id, balanceSub: 0, balancePayg: 0, balancePromo: 1},
          });
          return u;
        });
      }
    } else {
      user = await this.prisma.endUser.update({
        where: { id: user.id },
        data: {
          lastActiveAt: new Date(),
          avatarUrl: avatarUrl ?? user.avatarUrl,
          name: user.name || name,
        },
      });
    }

    const access_token = await this.signAccessToken(user.id, email, app.id);
    return {
      access_token,
      user: await this.buildPublicEndUserProfile(user.id),
    };
  }

  /**
   * 终端用户会话展示：昵称、头像、积分合计、套餐名（无套餐时为「免费计划」）。
   * 含 `appKey`（所属 Application.apiKey，供 X-App-Key / 文档示例；未配置时为 null）。
   */
  private async buildPublicEndUserProfile(userId: string) {
    const user = await this.prisma.endUser.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        passwordHash: true,
        apiKey: true,
        createdAt: true,
        app: { select: { apiKey: true } },
        creditAccount: {
          select: {
            balanceSub: true,
            balancePayg: true,
            balancePromo: true,
          },
        },
        plan: { select: { name: true } },
        subscriptions: {
          where: { status: SubStatus.active },
          orderBy: { currentPeriodEnd: 'desc' },
          take: 1,
          select: {
            currentPeriodStart: true,
            currentPeriodEnd: true,
            cancelAt: true,
            plan: {
              select: { billingInterval: true, price: true, name: true },
            },
          },
        },
      },
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    const ca = user.creditAccount;
    const credits =
      (ca?.balanceSub ?? 0) + (ca?.balancePayg ?? 0) + (ca?.balancePromo ?? 0);
    const planLabel = user.plan?.name?.trim() || 'Free';
    const hasApiKey = Boolean(user.apiKey?.trim());
    const apiKeyMasked =
      hasApiKey && user.apiKey ? maskEndUserApiKey(user.apiKey) : null;
    const sub = ca?.balanceSub ?? 0;
    const payg = ca?.balancePayg ?? 0;
    const promo = ca?.balancePromo ?? 0;
    const subRow = user.subscriptions[0];
    const subEnd = subRow?.currentPeriodEnd;
    let planDaysRemaining: number | null = null;
    if (subEnd && !Number.isNaN(subEnd.getTime())) {
      const ms = subEnd.getTime() - Date.now();
      planDaysRemaining = Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
    }

    let subscription: {
      currentPeriodStart: string | null;
      currentPeriodEnd: string | null;
      billingInterval: string;
      autoRenew: boolean;
      isComplimentary: boolean;
    } | null = null;
    if (subRow?.plan) {
      subscription = {
        currentPeriodStart: toIsoOrNull(subRow.currentPeriodStart),
        currentPeriodEnd: toIsoOrNull(subRow.currentPeriodEnd),
        billingInterval: subRow.plan.billingInterval,
        autoRenew: subRow.cancelAt == null,
        isComplimentary: Number(subRow.plan.price) === 0,
      };
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      appKey: user.app.apiKey ?? null,
      accountCreatedAt: user.createdAt.toISOString(),
      credits,
      creditsSub: sub,
      creditsPayg: payg,
      creditsPromo: promo,
      planLabel,
      planDaysRemaining,
      subscription,
      hasApiKey,
      apiKeyMasked,
      canChangePassword: Boolean(user.passwordHash),
    };
  }

  /** 首次生成：仅响应中返回完整密钥一次；之后 /me 仅含脱敏 */
  async generateApiKey(bearer: string | undefined) {
    const { userId } = await this.requireEndUserSession(bearer);
    const row = await this.prisma.endUser.findUnique({
      where: { id: userId },
      select: { apiKey: true },
    });
    if (row?.apiKey?.trim()) {
      throw new BadRequestException(
        'An API key already exists. Use Regenerate to create a new one.',
      );
    }
    const apiKey = generateEndUserApiKey();
    await this.prisma.endUser.update({
      where: { id: userId },
      data: { apiKey },
    });
    return {
      apiKey,
      warning:
        'Save this key now. It will only be shown once; later you will only see a masked value.',
    };
  }

  async regenerateApiKey(bearer: string | undefined) {
    const { userId } = await this.requireEndUserSession(bearer);
    const row = await this.prisma.endUser.findUnique({
      where: { id: userId },
      select: { apiKey: true },
    });
    if (!row?.apiKey?.trim()) {
      throw new BadRequestException('Generate an API key first');
    }
    const newKey = generateEndUserApiKey();
    await this.prisma.endUser.update({
      where: { id: userId },
      data: { apiKey: newKey },
    });
    return {
      apiKey: newKey,
      warning:
        'Your new key is shown only once. Save it now; the previous key is no longer valid.',
    };
  }

  /** 当前应用下终端用户的订单列表（营销站「我的订单」） */
  async listMyOrders(
    bearer: string | undefined,
    opts: {
      page?: number;
      limit?: number;
      type?: string;
      status?: string;
    } = {},
  ) {
    const { userId, appId } = await this.requireEndUserSession(bearer);
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? 20));

    const where: Prisma.OrderWhereInput = { userId, appId };

    const orderTypes = ['subscription', 'payg', 'one_time'] as const;
    if (
      opts.type &&
      orderTypes.includes(opts.type as (typeof orderTypes)[number])
    ) {
      where.type = opts.type as (typeof orderTypes)[number];
    }

    const orderStatuses = [
      'pending',
      'paid',
      'failed',
      'refunded',
      'cancelled',
    ] as const;
    if (
      opts.status &&
      orderStatuses.includes(opts.status as (typeof orderStatuses)[number])
    ) {
      where.status = opts.status as (typeof orderStatuses)[number];
    }

    const skip = (page - 1) * limit;
    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.order.count({ where }),
    ]);
    const planIds = [
      ...new Set(
        orders.map((o) => o.planId).filter((id): id is string => Boolean(id)),
      ),
    ];
    const plans =
      planIds.length > 0
        ? await this.prisma.pricingPlan.findMany({
            where: { id: { in: planIds }, appId },
            select: { id: true, name: true, description: true },
          })
        : [];
    const planMap = new Map(plans.map((p) => [p.id, p]));

    const totalPages = Math.max(1, Math.ceil(total / limit));

    return {
      items: orders.map((o) => {
        const plan = o.planId ? planMap.get(o.planId) : undefined;
        const amount = Number(o.amount);
        const discount =
          o.discountAmount != null ? Number(o.discountAmount) : null;
        const originalAmount =
          discount != null && discount > 0 ? amount + discount : null;

        let productTitle = 'Order';
        let productSubtitle: string | null = null;
        if (o.type === 'subscription') {
          productTitle = plan?.name?.trim() || 'Subscription';
          productSubtitle = plan?.description?.trim() || null;
        } else if (o.type === 'payg') {
          productTitle =
            o.creditsGranted > 0
              ? `${o.creditsGranted} credits`
              : 'Credit top-up';
        } else {
          productTitle = plan?.name?.trim() || 'Purchase';
          productSubtitle = plan?.description?.trim() ?? null;
        }

        return {
          id: o.id,
          orderNo: o.orderNo,
          type: o.type,
          status: o.status,
          amount,
          currency: o.currency,
          discountAmount: discount,
          originalAmount,
          creditsGranted: o.creditsGranted,
          productTitle,
          productSubtitle,
          gateway: o.gateway,
          paidAt: o.paidAt?.toISOString() ?? null,
          createdAt: o.createdAt.toISOString(),
        };
      }),
      total,
      page,
      limit,
      totalPages,
    };
  }

  /** 当前应用下终端用户的积分流水（营销站「我的积分」） */
  async listMyCreditTransactions(
    bearer: string | undefined,
    opts: {
      page?: number;
      limit?: number;
      type?: string;
      creditType?: string;
    },
  ) {
    const { userId, appId } = await this.requireEndUserSession(bearer);
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? 20));

    const where: Prisma.CreditTransactionWhereInput = {
      appId,
      account: { userId },
    };

    const txTypes = [
      'grant',
      'deduct',
      'expire',
      'refund',
      'purchase',
    ] as const;
    if (opts.type && txTypes.includes(opts.type as (typeof txTypes)[number])) {
      where.type = opts.type as (typeof txTypes)[number];
    }

    const poolTypes = ['subscription', 'payg', 'promo'] as const;
    if (
      opts.creditType &&
      poolTypes.includes(opts.creditType as (typeof poolTypes)[number])
    ) {
      where.creditType = opts.creditType as (typeof poolTypes)[number];
    }

    const skip = (page - 1) * limit;
    const [rows, total] = await Promise.all([
      this.prisma.creditTransaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          type: true,
          creditType: true,
          amount: true,
          reason: true,
          createdAt: true,
        },
      }),
      this.prisma.creditTransaction.count({ where }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));

    return {
      items: rows.map((r) => ({
        id: r.id,
        type: r.type,
        creditType: r.creditType,
        amount: r.amount,
        description: r.reason,
        createdAt: r.createdAt.toISOString(),
      })),
      total,
      page,
      limit,
      totalPages,
    };
  }

  private async requireEndUserSession(bearer: string | undefined): Promise<{
    userId: string;
    appId: string;
  }> {
    if (!bearer?.trim()) {
      throw new UnauthorizedException('Not signed in');
    }
    let payload: AccessJwtPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessJwtPayload>(bearer.trim());
    } catch {
      throw new UnauthorizedException('Session expired');
    }
    if (payload.typ !== 'end_user' || !payload.sub) {
      throw new UnauthorizedException('Invalid token');
    }
    const row = await this.prisma.endUser.findUnique({
      where: { id: payload.sub },
      select: { id: true, status: true, appId: true },
    });
    if (!row || row.status !== UserStatus.active) {
      throw new UnauthorizedException('Account is not available');
    }
    if (row.appId !== payload.appId) {
      throw new UnauthorizedException('Invalid token');
    }
    return { userId: row.id, appId: row.appId };
  }

  private async signAccessToken(
    userId: string,
    email: string,
    appId: string,
  ): Promise<string> {
    const body: AccessJwtPayload = {
      typ: 'end_user',
      sub: userId,
      email,
      appId,
    };
    return this.jwt.signAsync(body, { expiresIn: '7d' });
  }

  async getSessionFromBearer(token: string | undefined) {
    if (!token?.trim()) {
      throw new UnauthorizedException('Not signed in');
    }
    let payload: AccessJwtPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessJwtPayload>(token.trim());
    } catch {
      throw new UnauthorizedException('Session expired');
    }
    if (payload.typ !== 'end_user' || !payload.sub) {
      throw new UnauthorizedException('Invalid token');
    }
    const row = await this.prisma.endUser.findUnique({
      where: { id: payload.sub },
      select: { id: true, status: true, appId: true },
    });
    if (!row || row.status !== UserStatus.active) {
      throw new UnauthorizedException('Account is not available');
    }
    if (row.appId !== payload.appId) {
      throw new UnauthorizedException('Invalid token');
    }
    return {
      user: await this.buildPublicEndUserProfile(payload.sub),
    };
  }
}
