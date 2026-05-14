import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import type { Application } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizeApplicationForApiResponse } from '../../common/utils/application-response.util';
import { CreateAppDto, UpdateAppDto } from './dto/create-app.dto';
import { PatchRemoveBackgroundSettingsDto } from '../remove-background/dto/remove-bg-settings.dto';
import { PatchLinkmePaySettingsDto } from '../linkmepay/dto/linkmepay-settings.dto';
import { PatchSmtpSettingsDto } from './dto/patch-smtp-settings.dto';
import { v4 as uuid } from 'uuid';
import { GlobalIntegrationSettingsService } from '../global-integration/global-integration-settings.service';
import {
  GLOBAL_INTEGRATION_LINKME_PAY,
  GLOBAL_INTEGRATION_REMOVE_BACKGROUND,
  GLOBAL_INTEGRATION_SMTP,
} from '../global-integration/global-integration.constants';
import { KlingImageService } from '../kling-image/kling-image.service';
import type { PatchKlingImageSettingsDto } from '../kling-image/dto/kling-image-settings.dto';
import { ReplicateService } from '../replicate/replicate.service';
import type { PatchReplicateSettingsDto } from '../replicate/dto/patch-replicate-settings.dto';
@Injectable()
export class AppRegistryService {
  constructor(
    private prisma: PrismaService,
    private globalIntegration: GlobalIntegrationSettingsService,
    private klingImage: KlingImageService,
    private replicate: ReplicateService,
  ) {}

  async create(dto: CreateAppDto) {
    const existing = await this.prisma.application.findUnique({
      where: { slug: dto.slug },
    });
    if (existing) throw new ConflictException('Slug already exists');

    const { googleClientId, ...rest } = dto;
    const g = googleClientId?.trim() ?? '';
    if (g.includes('****')) {
      throw new BadRequestException('Invalid googleClientId value');
    }
    const created = await this.prisma.application.create({
      data: {
        ...rest,
        apiKey: `cbg_${uuid().replace(/-/g, '')}`,
        googleClientId: g || null,
      },
    });
    return sanitizeApplicationForApiResponse(created);
  }

  async findAll(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [rows, total] = await Promise.all([
      this.prisma.application.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.application.count(),
    ]);
    const data = rows.map((a) => sanitizeApplicationForApiResponse(a));
    return { data, total, page, limit };
  }

  /** 存在性校验（返回库内完整行，勿直接作为 HTTP 响应） */
  private async requireApplication(id: string): Promise<Application> {
    const app = await this.prisma.application.findUnique({ where: { id } });
    if (!app) throw new NotFoundException('Application not found');
    return app;
  }

  /** 管理端应用详情：`googleClientId` 脱敏 */
  async findOne(id: string) {
    const app = await this.requireApplication(id);
    return sanitizeApplicationForApiResponse(app);
  }

  async update(id: string, dto: UpdateAppDto) {
    await this.requireApplication(id);
    const data: Prisma.ApplicationUpdateInput = {};

    if (dto.name !== undefined) data.name = dto.name;
    if (dto.domain !== undefined) data.domain = dto.domain;
    if (dto.logoUrl !== undefined) data.logoUrl = dto.logoUrl;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.environment !== undefined) data.environment = dto.environment;
    if (dto.googleClientId !== undefined) {
      const v = dto.googleClientId?.trim() ?? '';
      if (v.includes('****')) {
        throw new BadRequestException(
          'googleClientId must be the real OAuth client ID from Google Cloud, not the masked value from the list.',
        );
      }
      data.googleClientId = v || null;
    }

    const updated = await this.prisma.application.update({
      where: { id },
      data,
    });
    return sanitizeApplicationForApiResponse(updated);
  }

  async remove(id: string) {
    await this.requireApplication(id);
    const deleted = await this.prisma.application.delete({ where: { id } });
    return sanitizeApplicationForApiResponse(deleted);
  }

  async rotateApiKey(id: string) {
    await this.requireApplication(id);
    const rotated = await this.prisma.application.update({
      where: { id },
      data: { apiKey: `cbg_${uuid().replace(/-/g, '')}` },
    });
    return sanitizeApplicationForApiResponse(rotated);
  }

  /** 管理端读取抠图 API 配置（不返回密码明文）；数据来自全站 name=removeBackground */
  async getClearbgSettings(id: string) {
    await this.requireApplication(id);
    const rb = await this.globalIntegration.getConfig(
      GLOBAL_INTEGRATION_REMOVE_BACKGROUND,
    );
    const pass = typeof rb.authPass === 'string' ? rb.authPass : '';
    return {
      url: typeof rb.url === 'string' ? rb.url : '',
      authUser: typeof rb.authUser === 'string' ? rb.authUser : '',
      authPassSet: pass.length > 0,
      enabled: rb.enabled === true,
    };
  }

  /** 写入全站 name=removeBackground 的 config */
  async patchClearbgSettings(
    id: string,
    dto: PatchRemoveBackgroundSettingsDto,
  ) {
    await this.requireApplication(id);
    await this.globalIntegration.mergeConfig(
      GLOBAL_INTEGRATION_REMOVE_BACKGROUND,
      (rbRaw) => {
        const next = { ...rbRaw };
        if (dto.url !== undefined) next.url = dto.url.trim();
        if (dto.authUser !== undefined) next.authUser = dto.authUser;
        if (dto.authPass !== undefined) next.authPass = dto.authPass;
        if (dto.enabled !== undefined) next.enabled = dto.enabled;
        return next;
      },
    );
    return this.findOne(id);
  }

  /** 集成能力总览；集成项来自全站表，与 appId 无关（仍校验应用存在） */
  async getIntegrationsOverview(id: string) {
    await this.requireApplication(id);
    const [rb, lm, smtp, kling, replicate] = await Promise.all([
      this.getClearbgSettings(id),
      this.getLinkmePaySettings(id),
      this.getSmtpSettings(id),
      this.klingImage.getSettingsForAdmin(),
      this.replicate.getSettingsForAdmin(),
    ]);
    return {
      clearbg: {
        enabled: rb.enabled,
        configured: rb.enabled && !!rb.url?.trim(),
      },
      linkmePay: {
        enabled: lm.enabled,
        configured:
          lm.enabled &&
          lm.secretKeySet &&
          !!lm.pid?.trim() &&
          !!lm.notifyPublicBase?.trim(),
      },
      smtp: {
        enabled: smtp.enabled,
        configured:
          smtp.enabled &&
          !!smtp.host?.trim() &&
          smtp.port > 0 &&
          !!smtp.user?.trim() &&
          smtp.passSet &&
          (!!smtp.from?.trim() || !!smtp.user?.trim()),
      },
      klingImage: {
        enabled: kling.enabled,
        configured: kling.enabled && kling.apiKeySet,
      },
      replicate: {
        enabled: replicate.enabled,
        configured: replicate.enabled && replicate.apiTokenSet,
      },
    };
  }

  async getReplicateSettings(id: string) {
    await this.requireApplication(id);
    return this.replicate.getSettingsForAdmin();
  }

  async patchReplicateSettings(id: string, dto: PatchReplicateSettingsDto) {
    await this.requireApplication(id);
    await this.replicate.patchAdminSettings(dto);
    return this.replicate.getSettingsForAdmin();
  }

  async getKlingImageSettings(id: string) {
    await this.requireApplication(id);
    return this.klingImage.getSettingsForAdmin();
  }

  async patchKlingImageSettings(id: string, dto: PatchKlingImageSettingsDto) {
    await this.requireApplication(id);
    await this.klingImage.patchAdminSettings(dto);
    return this.findOne(id);
  }

  /** 读取 SMTP（不返回密码）；全站 name=smtp */
  async getSmtpSettings(id: string) {
    await this.requireApplication(id);
    const smtp = await this.globalIntegration.getConfig(
      GLOBAL_INTEGRATION_SMTP,
    );
    const pass = typeof smtp.pass === 'string' ? smtp.pass : '';
    return {
      enabled: smtp.enabled !== false,
      host: typeof smtp.host === 'string' ? smtp.host : '',
      port: typeof smtp.port === 'number' ? smtp.port : 587,
      user: typeof smtp.user === 'string' ? smtp.user : '',
      from: typeof smtp.from === 'string' ? smtp.from : '',
      passSet: pass.length > 0,
      tlsRejectUnauthorized: smtp.tlsRejectUnauthorized !== false,
    };
  }

  async patchSmtpSettings(id: string, dto: PatchSmtpSettingsDto) {
    await this.requireApplication(id);
    await this.globalIntegration.mergeConfig(
      GLOBAL_INTEGRATION_SMTP,
      (smtpRaw) => {
        const next = { ...smtpRaw };
        if (dto.enabled !== undefined) next.enabled = dto.enabled;
        if (dto.host !== undefined) next.host = dto.host.trim();
        if (dto.port !== undefined) next.port = dto.port;
        if (dto.user !== undefined) next.user = dto.user.trim();
        if (dto.from !== undefined) next.from = dto.from.trim();
        if (dto.tlsRejectUnauthorized !== undefined) {
          next.tlsRejectUnauthorized = dto.tlsRejectUnauthorized;
        }
        if (dto.pass !== undefined && dto.pass.trim() !== '') {
          next.pass = dto.pass;
        }
        return next;
      },
    );
    return this.findOne(id);
  }

  async getLinkmePaySettings(id: string) {
    await this.requireApplication(id);
    const lm = await this.globalIntegration.getConfig(
      GLOBAL_INTEGRATION_LINKME_PAY,
    );
    const sk = typeof lm.secretKey === 'string' ? lm.secretKey : '';
    return {
      enabled: lm.enabled === true,
      baseUrl:
        typeof lm.baseUrl === 'string' && lm.baseUrl
          ? lm.baseUrl
          : 'https://api.linkmepay.com',
      pid: typeof lm.pid === 'string' ? lm.pid : '',
      secretKeySet: sk.length > 0,
      defaultAction:
        typeof lm.defaultAction === 'string' && lm.defaultAction
          ? lm.defaultAction
          : 'SN20108',
      notifyPublicBase:
        typeof lm.notifyPublicBase === 'string' ? lm.notifyPublicBase : '',
    };
  }

  async patchLinkmePaySettings(id: string, dto: PatchLinkmePaySettingsDto) {
    await this.requireApplication(id);
    await this.globalIntegration.mergeConfig(
      GLOBAL_INTEGRATION_LINKME_PAY,
      (lmRaw) => {
        const next = { ...lmRaw };
        if (dto.enabled !== undefined) next.enabled = dto.enabled;
        if (dto.baseUrl !== undefined) next.baseUrl = dto.baseUrl.trim();
        if (dto.pid !== undefined) next.pid = dto.pid.trim();
        if (dto.secretKey !== undefined) next.secretKey = dto.secretKey;
        if (dto.defaultAction !== undefined)
          next.defaultAction = dto.defaultAction.trim();
        if (dto.notifyPublicBase !== undefined) {
          next.notifyPublicBase = dto.notifyPublicBase.trim();
        }
        return next;
      },
    );
    return this.findOne(id);
  }
}
