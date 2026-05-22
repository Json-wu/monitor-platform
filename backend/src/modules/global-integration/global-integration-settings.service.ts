import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  GLOBAL_INTEGRATION_GUMROAD,
  GLOBAL_INTEGRATION_LINKME_PAY,
  GLOBAL_INTEGRATION_REMOVE_BACKGROUND,
  GLOBAL_INTEGRATION_SMTP,
  type GlobalIntegrationName,
} from './global-integration.constants';

/**
 * 全站集成：表 `global_integration_setting`，每行 `name` + `config` JSON。
 * 对外仍组装为与旧版兼容的根对象：`integrations.linkmePay`、`removeBackgroundApi`、`smtp`。
 */
@Injectable()
export class GlobalIntegrationSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  /** 单行 config（不存在则插入空对象后返回） */
  async getConfig(
    name: GlobalIntegrationName,
  ): Promise<Record<string, unknown>> {
    const row = await this.ensureRow(name);
    const c = row.config;
    if (!c || typeof c !== 'object' || Array.isArray(c)) return {};
    return { ...(c as Record<string, unknown>) };
  }

  async mergeConfig(
    name: GlobalIntegrationName,
    mutator: (prev: Record<string, unknown>) => Record<string, unknown>,
  ) {
    const prev = await this.getConfig(name);
    const next = mutator(prev);
    await this.prisma.globalIntegrationSetting.upsert({
      where: { name },
      create: { name, config: next as Prisma.InputJsonValue },
      update: { config: next as Prisma.InputJsonValue },
    });
  }

  /** 供 readIntegrationsRoot / readSmtpSettingsFromApp / RemoveBackgroundService.parseSettings 使用 */
  async getSettingsObject(): Promise<Record<string, unknown>> {
    const [lm, rb, smtp, gum] = await Promise.all([
      this.getConfig(GLOBAL_INTEGRATION_LINKME_PAY),
      this.getConfig(GLOBAL_INTEGRATION_REMOVE_BACKGROUND),
      this.getConfig(GLOBAL_INTEGRATION_SMTP),
      this.getConfig(GLOBAL_INTEGRATION_GUMROAD),
    ]);
    return {
      integrations: { linkmePay: lm, gumroad: gum },
      removeBackgroundApi: rb,
      smtp,
    };
  }

  private async ensureRow(name: GlobalIntegrationName) {
    const existing = await this.prisma.globalIntegrationSetting.findUnique({
      where: { name },
    });
    if (existing) return existing;
    return this.prisma.globalIntegrationSetting.create({
      data: { name, config: {} },
    });
  }
}
