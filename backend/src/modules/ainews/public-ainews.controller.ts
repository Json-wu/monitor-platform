import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Put,
  Query,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { AinewsAccountService } from './ainews-account.service';
import { AinewsAnonService } from './ainews-anon.service';
import { AinewsNewsService } from './ainews-news.service';
import { AinewsPreferencesService } from './ainews-preferences.service';
import { AinewsSummarizeService } from './ainews-summarize.service';
import { AinewsTrackService } from './ainews-track.service';
import { resolveAinewsUserId } from './ainews-user-resolve.util';
import { AINEWS_APP_SLUG } from './ainews.constants';
import { hmacSha256Hex } from './lib/hmac-user';
import { env } from './lib/env';
import type { Response } from 'express';

function bearerToken(auth?: string): string | undefined {
  if (!auth?.startsWith('Bearer ')) return undefined;
  return auth.slice(7).trim() || undefined;
}

@ApiTags('Industry AI News（公开）')
@Controller('public/ainews')
export class PublicAinewsController {
  constructor(
    private readonly account: AinewsAccountService,
    private readonly anon: AinewsAnonService,
    private readonly news: AinewsNewsService,
    private readonly track: AinewsTrackService,
    private readonly summarize: AinewsSummarizeService,
    private readonly preferences: AinewsPreferencesService,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  private async optionalEndUser(authHeader?: string) {
    const token = bearerToken(authHeader);
    if (!token) return null;
    try {
      const payload = await this.jwt.verifyAsync<{
        typ?: string;
        sub?: string;
        appId?: string;
      }>(token);
      if (payload.typ !== 'end_user' || !payload.sub) return null;
      const endUser = await this.prisma.endUser.findUnique({
        where: { id: payload.sub },
        select: { email: true },
      });
      return {
        endUserId: payload.sub,
        email: endUser?.email ?? null,
      };
    } catch {
      return null;
    }
  }

  private requireEndUser(authHeader?: string) {
    return this.optionalEndUser(authHeader).then((s) => {
      if (!s) throw new UnauthorizedException('Not signed in');
      return s;
    });
  }

  @Post('anon/resolve')
  @Public()
  @ApiOperation({ summary: '解析 deviceId → end_user id（设备访客）' })
  resolveAnon(
    @Body() body: { deviceId?: string; timezone?: string; uiLang?: string },
  ) {
    return this.anon.resolveByDeviceId(body.deviceId ?? '', {
      timezone: body.timezone,
      uiLang: body.uiLang,
    });
  }

  @Get('account-tier')
  @Public()
  @ApiOperation({ summary: '当前账户档位（匿名 free / 登录用户查订阅）' })
  async accountTier(@Headers('authorization') auth?: string) {
    const session = await this.optionalEndUser(auth);
    if (!session) {
      return this.account.resolveAnonAccount();
    }
    return this.account.resolveForEndUser(session.endUserId, session.email);
  }

  @Post('link-account')
  @Public()
  @ApiOperation({ summary: '登录后合并设备访客 end_user 与 OAuth 账户' })
  async linkAccount(
    @Headers('authorization') auth: string | undefined,
    @Headers('x-anon-user-id') anonUserId: string | undefined,
    @Body() body: { anonUserId?: string; deviceId?: string },
  ) {
    const session = await this.optionalEndUser(auth);
    if (!session) {
      throw new UnauthorizedException('Not signed in');
    }
    const anonId = (anonUserId ?? body.anonUserId ?? '').trim();
    if (!anonId && !(body.deviceId ?? '').trim()) {
      throw new UnauthorizedException('Missing device id');
    }
    const linked = await this.account.linkAnonToEndUser(
      session.endUserId,
      session.email,
      body.deviceId ?? '',
      anonId,
    );
    if (!linked) {
      throw new UnauthorizedException('Link failed');
    }
    return linked;
  }

  @Post('news/list')
  @Public()
  @ApiOperation({ summary: '分页拉取 RSS 入库新闻' })
  async listNews(
    @Headers('authorization') auth: string | undefined,
    @Body()
    body: {
      domains?: string[];
      locale?: string;
      limit?: number;
      offset?: number;
      userId?: string;
      deviceId?: string;
    },
  ) {
    const session = await this.optionalEndUser(auth);
    const userId = await resolveAinewsUserId(this.prisma, {
      deviceId: String(body.deviceId ?? ''),
      session,
    });
    return this.news.listNews({
      domains: body.domains ?? [],
      locale: body.locale,
      limit: body.limit,
      offset: body.offset,
      userId,
    });
  }

  @Post('track/prefs')
  @Public()
  @ApiOperation({ summary: '保存匿名/用户偏好快照' })
  async trackPrefs(
    @Headers('authorization') auth: string | undefined,
    @Headers('x-anon-user-id') anonUserId: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    const session = await this.optionalEndUser(auth);
    const deviceId = String(body.deviceId ?? '').trim();
    if (!session && !deviceId && !anonUserId) {
      throw new UnauthorizedException('Missing device id');
    }
    const userId = await resolveAinewsUserId(this.prisma, {
      deviceId,
      session,
      profile: {
        timezone: String(body.timezone ?? ''),
        uiLang: String(body.uiLang ?? ''),
      },
    });
    return this.track.trackPrefs({
      userId,
      ip: String(body.ip ?? ''),
      timezone: String(body.timezone ?? ''),
      followDomains: Array.isArray(body.followDomains)
        ? (body.followDomains as string[])
        : [],
      reminderMode: String(body.reminderMode ?? ''),
      reminderDnd: Boolean(body.reminderDnd),
      reminderIntervalMinutes: Number(body.reminderIntervalMinutes ?? 0),
      reminderWindowStartHour: Number(body.reminderWindowStartHour ?? 0),
      reminderWindowEndHour: Number(body.reminderWindowEndHour ?? 0),
      uiLang: String(body.uiLang ?? ''),
      uiTheme: String(body.uiTheme ?? ''),
      systemLanguage: String(body.systemLanguage ?? ''),
      email: typeof body.email === 'string' ? body.email : '',
      userTier: typeof body.userTier === 'string' ? body.userTier : '',
      deviceId: typeof body.deviceId === 'string' ? body.deviceId : '',
    });
  }

  @Post('track/action')
  @Public()
  @ApiOperation({ summary: '记录文章交互' })
  async trackAction(
    @Headers('authorization') auth: string | undefined,
    @Headers('x-anon-user-id') anonUserId: string | undefined,
    @Body()
    body: {
      userId?: string;
      deviceId?: string;
      action?: string;
      canonicalUrl?: string;
      sourceUrl?: string;
      ip?: string;
      timezone?: string;
    },
  ) {
    const session = await this.optionalEndUser(auth);
    const deviceId = (body.deviceId ?? '').trim();
    const userId = await resolveAinewsUserId(this.prisma, {
      deviceId,
      session,
    });
    const action = (body.action ?? '').trim() as 'like' | 'dislike' | 'read' | 'open';
    const canonicalUrl = (body.canonicalUrl ?? '').trim();
    if (!userId || !action || !canonicalUrl) {
      throw new UnauthorizedException('Invalid payload');
    }
    return this.track.trackArticleAction({
      userId,
      action,
      canonicalUrl,
      sourceUrl: body.sourceUrl,
      ip: body.ip,
      timezone: body.timezone,
    });
  }

  @Get('summary-usage')
  @Public()
  @ApiOperation({ summary: '当日 AI 摘要用量' })
  async summaryUsage(
    @Headers('authorization') auth?: string,
    @Headers('x-anon-user-id') anonUserId?: string,
  ) {
    const session = await this.optionalEndUser(auth);
    return this.summarize.getSummaryUsage({
      endUserId: session?.endUserId,
      anonUserId: anonUserId?.trim(),
    });
  }

  @Post('summarize')
  @Public()
  @ApiOperation({ summary: '批量生成/读取 AI 摘要' })
  async summarizeArticles(
    @Headers('authorization') auth?: string,
    @Headers('x-anon-user-id') anonUserId?: string,
    @Body()
    body?: {
      locale?: string;
      items?: Array<{ url?: string; title?: string; hint?: string }>;
    },
  ) {
    const session = await this.optionalEndUser(auth);
    return this.summarize.summarizeArticles({
      endUserId: session?.endUserId,
      anonUserId: anonUserId?.trim(),
      locale: body?.locale,
      items: body?.items,
    });
  }

  @Get('extension-preferences')
  @Public()
  @ApiOperation({ summary: '读取登录用户扩展偏好（Pro 跨设备同步）' })
  async getExtensionPreferences(@Headers('authorization') auth?: string) {
    const session = await this.requireEndUser(auth);
    const row = await this.preferences.getForEndUser(session.endUserId);
    return { row };
  }

  @Put('extension-preferences')
  @Public()
  @ApiOperation({ summary: '写入登录用户扩展偏好' })
  async putExtensionPreferences(
    @Headers('authorization') auth: string | undefined,
    @Body()
    body: {
      industryIds?: string[];
      reminderMode?: string;
      uiTheme?: string;
      onboardingComplete?: boolean;
      followKeywords?: string[];
      timezone?: string;
      uiLang?: string;
      reminderEmail?: string;
      emailDigestOptOut?: boolean;
    },
  ) {
    const session = await this.requireEndUser(auth);
    const row = await this.preferences.upsertForEndUser(session.endUserId, {
      industryIds: body.industryIds,
      reminderMode: body.reminderMode,
      uiTheme: body.uiTheme,
      onboardingComplete: body.onboardingComplete,
      followKeywords: body.followKeywords,
      timezone: body.timezone,
      uiLang: body.uiLang,
      reminderEmail: body.reminderEmail,
      emailDigestOptOut: body.emailDigestOptOut,
    });
    return { row };
  }

  @Get('email-unsubscribe')
  @Public()
  @ApiOperation({ summary: '邮件简报退订（HMAC 链接）' })
  async emailUnsubscribe(
    @Query('uid') uidRaw: string | undefined,
    @Query('sig') sigRaw: string | undefined,
    @Res() res: Response,
  ) {
    const secret = env('EMAIL_UNSUBSCRIBE_SECRET');
    const htmlPage = (title: string, body: string) => {
      const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${title}</title></head><body style="font-family:system-ui,sans-serif;padding:2rem;max-width:40rem;line-height:1.6;">${body}</body></html>`;
      res.setHeader('Content-Type', 'text/html; charset=UTF-8');
      res.setHeader('Cache-Control', 'no-store');
      return res.send(html);
    };

    if (!secret) {
      return htmlPage('未配置', '<p>服务器未配置退订密钥，请联系管理员。</p>');
    }

    const uid = uidRaw?.trim() ?? '';
    const sig = sigRaw?.trim() ?? '';
    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uid || !uuidRe.test(uid) || !sig) {
      return htmlPage('链接无效', '<p>退订链接无效或已损坏。</p>');
    }

    const expected = await hmacSha256Hex(secret, uid);
    if (sig.length !== expected.length || sig !== expected) {
      return htmlPage('验证失败', '<p>无法验证退订请求。</p>');
    }

    try {
      await this.prisma.ainewsExtensionPreferences.update({
        where: { endUserId: uid },
        data: { emailDigestOptOut: true },
      });
    } catch (e) {
      return htmlPage('错误', `<p>更新失败：${String(e)}</p>`);
    }

    return htmlPage(
      '已退订',
      '<h1>已退订邮件简报</h1><p>将不再向你发送 Industry AI News 行业资讯邮件。若要重新订阅，请在扩展「设置」中开启订阅邮件简报。</p>',
    );
  }
}

/** Slug for extension OAuth: `chrome-ainews` */
export { AINEWS_APP_SLUG };
