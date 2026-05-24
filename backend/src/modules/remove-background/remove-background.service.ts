import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Application, CreditType } from '@prisma/client';
import { UserStatus, Prisma } from '@prisma/client';
import type { Request } from 'express';
import { getClientIp } from '../../common/utils/request.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreditService } from '../credit/credit.service';
import { GlobalIntegrationSettingsService } from '../global-integration/global-integration-settings.service';

export type RemoveBackgroundApiSettings = {
  url: string;
  authUser?: string;
  authPass?: string;
  enabled?: boolean;
};

/** 规范化后的入参，统一以二进制形式转交上游 multipart `image` */
export type ClearbgImagePayload = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
};

const CLEARBG_MAX_BYTES = 25 * 1024 * 1024;
const IMAGE_URL_FETCH_MS = 30_000;

@Injectable()
export class RemoveBackgroundService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credit: CreditService,
    private readonly globalIntegration: GlobalIntegrationSettingsService,
  ) {}

  parseSettings(settings: unknown): RemoveBackgroundApiSettings | null {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings))
      return null;
    const raw = (settings as Record<string, unknown>).removeBackgroundApi;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const o = raw as Record<string, unknown>;
    const url = typeof o.url === 'string' ? o.url.trim() : '';
    if (!url) return null;
    return {
      url,
      authUser: typeof o.authUser === 'string' ? o.authUser : undefined,
      authPass: typeof o.authPass === 'string' ? o.authPass : undefined,
      enabled: o.enabled === true,
    };
  }

  /**
   * 代理上传至第三方抠图 API（multipart/form-data，字段名 image；支持 HTTP Basic Auth）。
   */
  async proxyRemoveBackground(
    app: Application,
    image: ClearbgImagePayload,
  ): Promise<{ buffer: Buffer; contentType: string }> {
    if (app.status !== 'active') {
      throw new ServiceUnavailableException('Application is not active');
    }

    if (!image.buffer?.length) {
      throw new BadRequestException('Missing image');
    }

    const globalSettings = await this.globalIntegration.getSettingsObject();
    const cfg = this.parseSettings(globalSettings);
    if (!cfg || !cfg.enabled) {
      throw new ServiceUnavailableException(
        'Remove-background API is disabled or not configured (global integration settings)',
      );
    }

    const authHeader =
      cfg.authUser !== undefined && cfg.authPass !== undefined
        ? `Basic ${Buffer.from(`${cfg.authUser}:${cfg.authPass}`, 'utf8').toString('base64')}`
        : undefined;

    const form = new FormData();
    const blob = new Blob([new Uint8Array(image.buffer)], {
      type: image.mimetype || 'application/octet-stream',
    });
    form.append('image', blob, image.originalname || 'upload.jpg');

    let res: Response;
    try {
      res = await fetch(cfg.url, {
        method: 'POST',
        body: form,
        redirect: 'follow',
        headers: authHeader ? { Authorization: authHeader } : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new BadGatewayException(`Upstream clearbg request failed: ${msg}`);
    }

    const buf = Buffer.from(await res.arrayBuffer());
    if (!res.ok) {
      const text = buf.toString('utf8').slice(0, 2000);
      throw new BadGatewayException(
        `Upstream returned ${res.status}: ${text || '(empty body)'}`,
      );
    }

    const contentType = res.headers.get('content-type') || 'image/png';
    return { buffer: buf, contentType };
  }

  /**
   * 公开抠图：仅 `image` 一处来源 — multipart 文件，或同名字段文本（http(s) URL / base64 / data URL，自动识别）。
   */
  /**
   * 将 multipart `image` 字段解析为适合传给 Replicate 的字符串：
   * - 公网 HTTPS URL → 原样返回（Replicate 自行拉取，节省带宽）
   * - 二进制文件上传 → `data:<mime>;base64,<b64>`
   * - data URL 文本 → 原样返回
   * - 裸 base64 文本 → `data:application/octet-stream;base64,<b64>`
   */
  async resolveColorizeImageString(
    file: Express.Multer.File | undefined,
    body: { image?: string },
  ): Promise<string> {
    const imageText = typeof body.image === 'string' ? body.image.trim() : '';
    const hasFile = Boolean(file?.buffer && file.buffer.length > 0);
    const hasText = Boolean(imageText);

    if (hasFile && hasText) {
      throw new BadRequestException(
        'Provide `image` either as a file or as text (URL / base64), not both',
      );
    }
    if (!hasFile && !hasText) {
      throw new BadRequestException(
        'Missing `image`: multipart file, URL, base64, or data URL',
      );
    }

    if (hasFile) {
      const buf = file!.buffer;
      if (buf.length > CLEARBG_MAX_BYTES) {
        throw new BadRequestException('Image file exceeds size limit');
      }
      const mime = file!.mimetype || 'application/octet-stream';
      return `data:${mime};base64,${buf.toString('base64')}`;
    }

    const t = imageText;
    if (/^https?:\/\//i.test(t)) {
      let u: URL;
      try {
        u = new URL(t);
      } catch {
        throw new BadRequestException('Invalid image URL in `image`');
      }
      this.assertClearbgImageUrlHostAllowed(u.hostname);
      return t;
    }

    // base64 裸文本或 data URL
    const { buffer, mimetype } = this.decodeClearbgBase64Image(t);
    return `data:${mimetype};base64,${buffer.toString('base64')}`;
  }

  /**
   * 与 {@link resolveColorizeImageString} 相同规则，但字段名可指定为 `image` 或 `mask`（用于 inpainting 等）。
   */
  async resolvePublicImageFieldString(
    file: Express.Multer.File | undefined,
    body: Record<string, unknown>,
    field: 'image' | 'mask',
  ): Promise<string> {
    const raw = body[field];
    const imageText = typeof raw === 'string' ? raw.trim() : '';
    const hasFile = Boolean(file?.buffer && file.buffer.length > 0);
    const hasText = Boolean(imageText);

    if (hasFile && hasText) {
      throw new BadRequestException(
        `Provide \`${field}\` either as a file or as text (URL / base64), not both`,
      );
    }
    if (!hasFile && !hasText) {
      throw new BadRequestException(
        `Missing \`${field}\`: multipart file, URL, base64, or data URL`,
      );
    }

    if (hasFile) {
      const buf = file!.buffer;
      if (buf.length > CLEARBG_MAX_BYTES) {
        throw new BadRequestException(`${field} file exceeds size limit`);
      }
      const mime = file!.mimetype || 'application/octet-stream';
      return `data:${mime};base64,${buf.toString('base64')}`;
    }

    const t = imageText;
    if (/^https?:\/\//i.test(t)) {
      let u: URL;
      try {
        u = new URL(t);
      } catch {
        throw new BadRequestException(`Invalid ${field} URL`);
      }
      this.assertClearbgImageUrlHostAllowed(u.hostname);
      return t;
    }

    const { buffer, mimetype } = this.decodeClearbgBase64Image(t);
    return `data:${mimetype};base64,${buffer.toString('base64')}`;
  }

  async resolveClearbgImagePayload(
    file: Express.Multer.File | undefined,
    body: { image?: string },
  ): Promise<ClearbgImagePayload> {
    const imageText =
      typeof body.image === 'string' ? body.image.trim() : '';
    const hasFile = Boolean(file?.buffer && file.buffer.length > 0);
    const hasText = Boolean(imageText);

    if (hasFile && hasText) {
      throw new BadRequestException(
        'Provide `image` either as a file or as text (URL / base64), not both',
      );
    }
    if (!hasFile && !hasText) {
      throw new BadRequestException(
        'Missing `image`: multipart file, or text with http(s) URL, base64, or data URL',
      );
    }

    if (hasFile) {
      const buf = file!.buffer;
      if (buf.length > CLEARBG_MAX_BYTES) {
        throw new BadRequestException('Image file exceeds size limit');
      }
      return {
        buffer: buf,
        mimetype: file!.mimetype || 'application/octet-stream',
        originalname: file!.originalname || 'upload.jpg',
      };
    }

    return this.resolveClearbgImageFromString(imageText);
  }

  /** 文本 `image`：以 http(s) 开头走拉取，否则按 base64 / data URL 解码 */
  private async resolveClearbgImageFromString(
    s: string,
  ): Promise<ClearbgImagePayload> {
    const t = s.trim();
    if (!t) {
      throw new BadRequestException('Empty `image` text');
    }
    if (/^https?:\/\//i.test(t)) {
      return this.fetchClearbgImageFromUrl(t);
    }
    return this.decodeClearbgBase64Image(t);
  }

  private decodeClearbgBase64Image(raw: string): ClearbgImagePayload {
    let payload = raw.trim();
    let mimetype = 'application/octet-stream';
    let originalname = 'upload.jpg';

    const dataUrl = /^data:([^;]+);base64,(.+)$/is.exec(payload);
    if (dataUrl) {
      mimetype = dataUrl[1].trim() || mimetype;
      payload = dataUrl[2].replace(/\s/g, '');
      const ext = this.guessExtFromMime(mimetype);
      if (ext) originalname = `upload.${ext}`;
    } else {
      payload = payload.replace(/\s/g, '');
    }

    let buf: Buffer;
    try {
      buf = Buffer.from(payload, 'base64');
    } catch {
      throw new BadRequestException('Invalid base64 or data URL in `image`');
    }
    if (!buf.length) {
      throw new BadRequestException('Empty decoded image from `image`');
    }
    if (buf.length > CLEARBG_MAX_BYTES) {
      throw new BadRequestException('Decoded image exceeds size limit');
    }
    return { buffer: buf, mimetype, originalname };
  }

  private guessExtFromMime(mime: string): string | null {
    const m = mime.split(';')[0]?.trim().toLowerCase() || '';
    const map: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
      'image/heic': 'heic',
      'image/heif': 'heif',
    };
    return map[m] || null;
  }

  /** 拒绝常见内网 / 本地主机名，降低 SSRF 风险（不跟随重定向校验）。 */
  private assertClearbgImageUrlHostAllowed(hostname: string): void {
    const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (
      h === 'localhost' ||
      h.endsWith('.localhost') ||
      h.endsWith('.local') ||
      h === '0.0.0.0'
    ) {
      throw new BadRequestException('Image URL host is not allowed');
    }

    const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
    if (m) {
      const a = Number(m[1]);
      const b = Number(m[2]);
      if (
        a === 10 ||
        a === 127 ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        (a === 169 && b === 254) ||
        a === 0 ||
        a >= 224
      ) {
        throw new BadRequestException('Image URL host is not allowed');
      }
    }

    if (h.includes(':')) {
      throw new BadRequestException(
        'Image URL must use IPv4 hostnames or DNS names, not IPv6 literals',
      );
    }
  }

  private async fetchClearbgImageFromUrl(urlStr: string): Promise<ClearbgImagePayload> {
    let u: URL;
    try {
      u = new URL(urlStr);
    } catch {
      throw new BadRequestException('Invalid image URL in `image`');
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      throw new BadRequestException('Image URL in `image` must be http or https');
    }
    this.assertClearbgImageUrlHostAllowed(u.hostname);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), IMAGE_URL_FETCH_MS);
    let res: Response;
    try {
      res = await fetch(u.toString(), {
        method: 'GET',
        redirect: 'follow',
        signal: ctrl.signal,
        headers: { 'User-Agent': 'ClearbgMonitor/1.0' },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new BadGatewayException(`Failed to fetch image URL: ${msg}`);
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      throw new BadGatewayException(
        `Image URL returned HTTP ${res.status}`,
      );
    }

    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) {
      throw new BadRequestException('Empty response from image URL');
    }
    if (buf.length > CLEARBG_MAX_BYTES) {
      throw new BadRequestException('Image from URL exceeds size limit');
    }

    const mimetype =
      res.headers.get('content-type')?.split(';')[0]?.trim() ||
      'application/octet-stream';
    const pathLast = u.pathname.split('/').filter(Boolean).pop();
    const originalname =
      pathLast && pathLast.length < 200 ? pathLast : 'remote.jpg';

    return { buffer: buf, mimetype, originalname };
  }

  /** UTC 日历日（与 PostgreSQL date 对齐） */
  private utcDateOnly(d = new Date()): Date {
    return new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
    );
  }

  private isUniqueViolation(e: unknown): boolean {
    return (
      e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002'
    );
  }

  /**
   * 已登录/已识别终端用户：不占用匿名 IP 限额。
   * 未注册：同一应用下同一 IP 每个 UTC 日仅一次免费公开 API（与可灵生图匿名共用 `clearbg_anonymous_daily_usage`；上游失败会释放占用以便重试）。
   */
  async proxyClearbgPublic(
    req: Request,
    app: Application,
    image: ClearbgImagePayload,
    opts: { apiKey?: string; userId?: string },
  ): Promise<{ buffer: Buffer; contentType: string }> {
    const registered = await this.resolveRegisteredEndUser(app.id, opts);
    if (registered) {
      let debitedPool: CreditType | undefined;
      try {
        debitedPool = await this.credit.deductForClearbgApi(
          registered.id,
          app.id,
        );
        return await this.proxyRemoveBackground(app, image);
      } catch (e) {
        if (debitedPool !== undefined) {
          await this.credit
            .refundClearbgApiFailure(registered.id, app.id, debitedPool)
            .catch(() => undefined);
        }
        throw e;
      }
    }

    const ip = getClientIp(req);
    const dayUtc = this.utcDateOnly();

    let reserved = false;
    try {
      await this.prisma.clearbgAnonymousDailyUsage.create({
        data: {
          appId: app.id,
          ip,
          dayUtc,
        },
      });
      reserved = true;
    } catch (e) {
      if (this.isUniqueViolation(e)) {
        throw new HttpException(
          'Daily free limit reached for your network. Please sign in to continue or try again tomorrow.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      throw e;
    }

    try {
      return await this.proxyRemoveBackground(app, image);
    } catch (e) {
      if (reserved) {
        await this.prisma.clearbgAnonymousDailyUsage
          .deleteMany({
            where: { appId: app.id, ip, dayUtc },
          })
          .catch(() => undefined);
      }
      throw e;
    }
  }

  /**
   * 公开可灵生图：与 {@link proxyClearbgPublic} 相同规则。
   * - 带 `X-Api-Key` / `X-User-Id` 识别到终端用户：调用上游前扣 1 分，失败退回；
   * - 否则：与抠图共用 `clearbg_anonymous_daily_usage` 表，同一 app 下同一 IP 每 UTC 日仅一条免费占用。
   */
  async withKlingImagePublicCredits<T>(
    req: Request,
    app: Application,
    opts: { apiKey?: string; userId?: string },
    operation: () => Promise<T>,
  ): Promise<T> {
    const registered = await this.resolveRegisteredEndUser(app.id, opts);
    if (registered) {
      let debitedPool: CreditType | undefined;
      try {
        debitedPool = await this.credit.deductForKlingImageApi(
          registered.id,
          app.id,
        );
        return await operation();
      } catch (e) {
        if (debitedPool !== undefined) {
          await this.credit
            .refundKlingImageApiFailure(registered.id, app.id, debitedPool)
            .catch(() => undefined);
        }
        throw e;
      }
    }

    const ip = getClientIp(req);
    const dayUtc = this.utcDateOnly();

    let reserved = false;
    try {
      await this.prisma.clearbgAnonymousDailyUsage.create({
        data: {
          appId: app.id,
          ip,
          dayUtc,
        },
      });
      reserved = true;
    } catch (e) {
      if (this.isUniqueViolation(e)) {
        throw new HttpException(
          'Daily free limit reached for your network. Please sign in with your API key to continue or try again tomorrow.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      throw e;
    }

    try {
      return await operation();
    } catch (e) {
      if (reserved) {
        await this.prisma.clearbgAnonymousDailyUsage
          .deleteMany({
            where: { appId: app.id, ip, dayUtc },
          })
          .catch(() => undefined);
      }
      throw e;
    }
  }

  async withUpscalePublicCredits<T>(
    req: Request,
    app: Application,
    opts: { apiKey?: string; userId?: string },
    operation: () => Promise<T>,
    creditAmount = 1,
  ): Promise<T> {
    const registered = await this.resolveRegisteredEndUser(app.id, opts);
    if (registered) {
      let debitBreakdown:
        | Array<{ creditType: CreditType; amount: number }>
        | undefined;
      try {
        debitBreakdown = await this.credit.deductForUpscaleApi(
          registered.id,
          app.id,
          creditAmount,
        );
        return await operation();
      } catch (e) {
        if (debitBreakdown !== undefined && debitBreakdown.length > 0) {
          await this.credit
            .refundUpscaleApiFailure(registered.id, app.id, debitBreakdown)
            .catch(() => undefined);
        }
        throw e;
      }
    }

    const ip = getClientIp(req);
    const dayUtc = this.utcDateOnly();

    let reserved = false;
    try {
      await this.prisma.clearbgAnonymousDailyUsage.create({
        data: { appId: app.id, ip, dayUtc },
      });
      reserved = true;
    } catch (e) {
      if (this.isUniqueViolation(e)) {
        throw new HttpException(
          'Daily free limit reached for your network. Please sign in with your API key to continue or try again tomorrow.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      throw e;
    }

    try {
      return await operation();
    } catch (e) {
      if (reserved) {
        await this.prisma.clearbgAnonymousDailyUsage
          .deleteMany({ where: { appId: app.id, ip, dayUtc } })
          .catch(() => undefined);
      }
      throw e;
    }
  }

  async withDdcolorPublicCredits<T>(
    req: Request,
    app: Application,
    opts: { apiKey?: string; userId?: string },
    operation: () => Promise<T>,
  ): Promise<T> {
    const registered = await this.resolveRegisteredEndUser(app.id, opts);
    if (registered) {
      let debitedPool: CreditType | undefined;
      try {
        debitedPool = await this.credit.deductForDdcolorApi(
          registered.id,
          app.id,
        );
        return await operation();
      } catch (e) {
        if (debitedPool !== undefined) {
          await this.credit
            .refundDdcolorApiFailure(registered.id, app.id, debitedPool)
            .catch(() => undefined);
        }
        throw e;
      }
    }

    const ip = getClientIp(req);
    const dayUtc = this.utcDateOnly();

    let reserved = false;
    try {
      await this.prisma.clearbgAnonymousDailyUsage.create({
        data: { appId: app.id, ip, dayUtc },
      });
      reserved = true;
    } catch (e) {
      if (this.isUniqueViolation(e)) {
        throw new HttpException(
          'Daily free limit reached for your network. Please sign in with your API key to continue or try again tomorrow.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      throw e;
    }

    try {
      return await operation();
    } catch (e) {
      if (reserved) {
        await this.prisma.clearbgAnonymousDailyUsage
          .deleteMany({ where: { appId: app.id, ip, dayUtc } })
          .catch(() => undefined);
      }
      throw e;
    }
  }

  /**
   * 房间装修图（可灵）：已登录终端用户按主题数扣 1～4 分；匿名与可灵相同日限额。
   */
  async withRoomDecorationPublicCredits<T>(
    req: Request,
    app: Application,
    opts: { apiKey?: string; userId?: string },
    creditAmount: number,
    operation: () => Promise<T>,
  ): Promise<T> {
    const registered = await this.resolveRegisteredEndUser(app.id, opts);
    if (registered) {
      let debitBreakdown:
        | Array<{ creditType: CreditType; amount: number }>
        | undefined;
      try {
        debitBreakdown = await this.credit.deductForRoomDecorationApi(
          registered.id,
          app.id,
          creditAmount,
        );
        return await operation();
      } catch (e) {
        if (debitBreakdown !== undefined && debitBreakdown.length > 0) {
          await this.credit
            .refundRoomDecorationApiFailure(
              registered.id,
              app.id,
              debitBreakdown,
            )
            .catch(() => undefined);
        }
        throw e;
      }
    }

    const ip = getClientIp(req);
    const dayUtc = this.utcDateOnly();

    let reserved = false;
    try {
      await this.prisma.clearbgAnonymousDailyUsage.create({
        data: { appId: app.id, ip, dayUtc },
      });
      reserved = true;
    } catch (e) {
      if (this.isUniqueViolation(e)) {
        throw new HttpException(
          'Daily free limit reached for your network. Please sign in with your API key to continue or try again tomorrow.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      throw e;
    }

    try {
      return await operation();
    } catch (e) {
      if (reserved) {
        await this.prisma.clearbgAnonymousDailyUsage
          .deleteMany({ where: { appId: app.id, ip, dayUtc } })
          .catch(() => undefined);
      }
      throw e;
    }
  }

  private async resolveRegisteredEndUser(
    appId: string,
    opts: { apiKey?: string; userId?: string },
  ): Promise<{ id: string } | null> {
    const key = opts.apiKey?.trim();
    if (key) {
      const u = await this.prisma.endUser.findUnique({
        where: { apiKey: key },
        select: { id: true, appId: true, status: true },
      });
      if (!u || u.status !== UserStatus.active) {
        throw new UnauthorizedException('Invalid X-Api-Key');
      }
      if (u.appId !== appId) {
        throw new UnauthorizedException('Invalid X-Api-Key');
      }
      return { id: u.id };
    }
    const userId = opts.userId?.trim();
    if (userId) {
      const u = await this.prisma.endUser.findUnique({
        where: { id: userId },
        select: { id: true, appId: true, status: true },
      });
      if (!u || u.status !== UserStatus.active) {
        throw new UnauthorizedException('Invalid X-User-Id');
      }
      if (u.appId !== appId) {
        throw new UnauthorizedException('Invalid X-User-Id');
      }
      return { id: u.id };
    }
    return null;
  }

  /** Query `slug` 等场景：按应用 `slug` 解析。 */
  async findAppBySlugOrThrow(slug: string | undefined): Promise<Application> {
    const s = slug?.trim();
    if (!s) throw new BadRequestException('Query slug is required');
    const app = await this.prisma.application.findUnique({
      where: { slug: s },
    });
    if (!app) throw new NotFoundException('Application not found');
    return app;
  }

  /**
   * 抠图 / 生图 generate 等：请求头 `X-App-Key`（兼容旧客户端 `X-App-Id`）值为 **Application.apiKey**。
   */
  async findAppByApplicationSlugOrThrow(
    applicationSlug: string | undefined,
  ): Promise<Application> {
    const k = applicationSlug?.trim();
    if (!k) throw new BadRequestException('Invalid or missing X-App-Slug');
    const app = await this.prisma.application.findUnique({
      where: { slug: k },
    });
    if (!app) throw new NotFoundException('Application not found');
    return app;
  }

  assertAppKey(app: Application, apiKey: string | undefined): void {
    const k = apiKey?.trim();
    if (!k || !app.apiKey || k !== app.apiKey) {
      throw new UnauthorizedException('Invalid or missing X-App-Key');
    }
  }
}
