import {
  ConflictException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import {
  Prisma,
  NotificationChannel,
  NotificationStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../../common/mail/mail.service';
import {
  isSmtpReadyForSend,
  readSmtpSettingsFromApp,
} from '../../common/utils/smtp-settings.util';
import {
  CreateNotificationTemplateDto,
  SendBroadcastDto,
  UpdateNotificationTemplateDto,
} from './dto/notification.dto';
import { REGISTER_EMAIL_VERIFICATION_SLUG } from './notification-mail.constants';
import { GlobalIntegrationSettingsService } from '../global-integration/global-integration-settings.service';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private prisma: PrismaService,
    private mail: MailService,
    private globalIntegration: GlobalIntegrationSettingsService,
  ) {}

  async createTemplate(dto: CreateNotificationTemplateDto) {
    const existing = await this.prisma.notificationTemplate.findUnique({
      where: { appId_slug: { appId: dto.appId, slug: dto.slug } },
    });
    if (existing) throw new ConflictException('Template slug already exists');

    return this.prisma.notificationTemplate.create({
      data: {
        appId: dto.appId,
        name: dto.name,
        slug: dto.slug,
        channel: dto.channel,
        subject: dto.subject,
        body: dto.body,
        variables: (dto.variables as Prisma.InputJsonValue) || [],
        triggerEvent: dto.triggerEvent,
        webhookUrl: dto.webhookUrl,
      },
    });
  }

  async updateTemplate(id: string, dto: UpdateNotificationTemplateDto) {
    await this.findTemplate(id);
    return this.prisma.notificationTemplate.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.subject !== undefined && { subject: dto.subject }),
        ...(dto.body !== undefined && { body: dto.body }),
        ...(dto.variables !== undefined && {
          variables: dto.variables as Prisma.InputJsonValue,
        }),
        ...(dto.triggerEvent !== undefined && {
          triggerEvent: dto.triggerEvent,
        }),
        ...(dto.webhookUrl !== undefined && { webhookUrl: dto.webhookUrl }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.channel !== undefined && { channel: dto.channel }),
      },
    });
  }

  async deleteTemplate(id: string) {
    await this.findTemplate(id);
    await this.prisma.notificationLog.deleteMany({ where: { templateId: id } });
    return this.prisma.notificationTemplate.delete({ where: { id } });
  }

  async findTemplate(id: string) {
    const template = await this.prisma.notificationTemplate.findUnique({
      where: { id },
      include: { app: { select: { id: true, name: true } } },
    });
    if (!template) throw new NotFoundException('Template not found');
    return template;
  }

  async listTemplates(appId?: string, page = 1, limit = 50) {
    const where = appId ? { appId } : {};
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.notificationTemplate.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { app: { select: { id: true, name: true } } },
      }),
      this.prisma.notificationTemplate.count({ where }),
    ]);
    return { data, total, page, limit };
  }

  async sendBroadcast(dto: SendBroadcastDto) {
    let subject = dto.subject || null;
    let body = dto.body;
    let webhookUrl = dto.webhookUrl || null;

    if (dto.templateId) {
      const template = await this.findTemplate(dto.templateId);
      subject = subject || template.subject;
      body = body || template.body;
      webhookUrl = webhookUrl || template.webhookUrl;
    }

    if ((dto.channel === 'wecom' || dto.channel === 'webhook') && webhookUrl) {
      return this.sendWebhookBroadcast(dto, subject, body, webhookUrl);
    }

    const users = await this.prisma.endUser.findMany({
      where: {
        appId: dto.appId,
        status: 'active',
        ...(dto.userIds?.length ? { id: { in: dto.userIds } } : {}),
      },
      select: { id: true, email: true, name: true },
    });

    const createdAt = new Date();
    const logs = await this.prisma.$transaction(
      users.map((user) =>
        this.prisma.notificationLog.create({
          data: {
            appId: dto.appId,
            templateId: dto.templateId,
            userId: user.id,
            channel: dto.channel,
            status: NotificationStatus.sent,
            recipient: user.email,
            subject,
            body,
            metadata: { userName: user.name },
            sentAt: createdAt,
          },
        }),
      ),
    );

    return { sent: logs.length, channel: dto.channel, subject, createdAt };
  }

  private async sendWebhookBroadcast(
    dto: SendBroadcastDto,
    subject: string | null,
    body: string,
    webhookUrl: string,
  ) {
    let status: NotificationStatus = NotificationStatus.sent;
    let errorMessage: string | null = null;

    try {
      const wecomBody =
        dto.channel === 'wecom'
          ? {
              msgtype: 'markdown',
              markdown: {
                content: subject ? `### ${subject}\n${body}` : body,
              },
            }
          : { text: body, subject };

      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(wecomBody),
      });

      if (!res.ok) {
        status = NotificationStatus.failed;
        errorMessage = `HTTP ${res.status}`;
      }
    } catch (err) {
      status = NotificationStatus.failed;
      errorMessage =
        err instanceof Error ? err.message : 'Webhook request failed';
      this.logger.error(`Webhook send failed: ${errorMessage}`);
    }

    const log = await this.prisma.notificationLog.create({
      data: {
        appId: dto.appId,
        templateId: dto.templateId,
        channel: dto.channel,
        status,
        recipient: webhookUrl,
        subject,
        body,
        errorMessage,
        metadata: { webhookUrl },
        sentAt: status === NotificationStatus.sent ? new Date() : null,
      },
    });

    return {
      sent: status === NotificationStatus.sent ? 1 : 0,
      channel: dto.channel,
      subject,
      status,
      createdAt: log.createdAt,
    };
  }

  async listLogs(
    filters: { appId?: string; channel?: string; status?: string },
    page = 1,
    limit = 50,
  ) {
    const where: Prisma.NotificationLogWhereInput = {};
    if (filters.appId) where.appId = filters.appId;
    if (filters.channel) {
      where.channel = filters.channel as NotificationChannel;
    }
    if (filters.status) {
      where.status = filters.status as NotificationStatus;
    }

    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.notificationLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          app: { select: { id: true, name: true } },
          user: { select: { id: true, email: true, name: true } },
          template: { select: { id: true, name: true, slug: true } },
        },
      }),
      this.prisma.notificationLog.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  /** 将 {{var}} 替换为变量值 */
  interpolateTemplate(template: string, vars: Record<string, string>): string {
    return template.replace(
      /\{\{\s*(\w+)\s*\}\}/g,
      (_, key: string) => vars[key] ?? '',
    );
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * 注册验证码邮件：优先使用当前应用下 slug=`register_email_verification` 的 Email 模板；
   * 未配置模板时使用默认中文文案。发信使用 **全站集成表中的 SMTP**（后台「集成」页，所有应用共用），并写入 notification_log。
   */
  async sendRegisterVerificationEmail(params: {
    appId: string;
    appName: string;
    to: string;
    code: string;
    expiryMinutes: number;
  }): Promise<void> {
    const slug =
      process.env.REGISTER_VERIFY_TEMPLATE_SLUG?.trim() ||
      REGISTER_EMAIL_VERIFICATION_SLUG;

    const variables: Record<string, string> = {
      code: params.code,
      email: params.to,
      appName: params.appName,
      expiryMinutes: String(params.expiryMinutes),
    };

    const [template, globalSettings] = await Promise.all([
      this.prisma.notificationTemplate.findFirst({
        where: {
          appId: params.appId,
          slug,
          channel: NotificationChannel.email,
          isActive: true,
        },
      }),
      this.globalIntegration.getSettingsObject(),
    ]);

    let subject = '{{appName}} 邮箱验证码';
    let bodyText =
      '您的验证码为 {{code}}，{{expiryMinutes}} 分钟内有效。如非本人操作请忽略。\n\n—— {{appName}}';
    let bodyHtml: string | undefined;

    if (template?.subject?.trim()) {
      subject = this.interpolateTemplate(template.subject, variables);
    } else {
      subject = this.interpolateTemplate(subject, variables);
    }

    if (template?.body) {
      const raw = this.interpolateTemplate(template.body, variables);
      const looksHtml = /<[^>]+>/.test(template.body);
      if (looksHtml) {
        bodyHtml = raw;
        bodyText = this.stripHtml(raw) || raw;
      } else {
        bodyText = raw;
      }
    } else {
      bodyText = this.interpolateTemplate(bodyText, variables);
    }

    const smtpPartial = readSmtpSettingsFromApp(globalSettings);

    const log = await this.prisma.notificationLog.create({
      data: {
        appId: params.appId,
        templateId: template?.id ?? null,
        channel: NotificationChannel.email,
        status: NotificationStatus.queued,
        recipient: params.to,
        subject,
        body: bodyHtml ?? bodyText,
        metadata: {
          kind: 'register_verification',
          variables,
        } as object,
      },
    });

    if (!isSmtpReadyForSend(smtpPartial)) {
      if (process.env.NODE_ENV === 'production') {
        await this.prisma.notificationLog.update({
          where: { id: log.id },
          data: {
            status: NotificationStatus.failed,
            errorMessage:
              '未配置全站 SMTP：请在 Monitor 后台「集成 → 发信 (SMTP)」填写并保存（所有应用共用）',
          },
        });
        throw new Error('Global SMTP is not configured');
      }
      this.logger.warn(
        `[dev] 未配置全站 SMTP，验证码 ${params.code} → ${params.to}（仅日志）`,
      );
      await this.prisma.notificationLog.update({
        where: { id: log.id },
        data: {
          status: NotificationStatus.failed,
          errorMessage: 'dev_skip_no_global_smtp',
        },
      });
      return;
    }

    try {
      await this.mail.sendMailWithAppSmtp(smtpPartial, {
        from: smtpPartial.from || smtpPartial.user,
        to: params.to,
        subject,
        text: bodyText,
        html: bodyHtml,
      });
      await this.prisma.notificationLog.update({
        where: { id: log.id },
        data: {
          status: NotificationStatus.sent,
          sentAt: new Date(),
          errorMessage: null,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'send failed';
      this.logger.error(`Register verification email failed: ${msg}`);
      await this.prisma.notificationLog.update({
        where: { id: log.id },
        data: {
          status: NotificationStatus.failed,
          errorMessage: msg,
        },
      });
      throw err;
    }
  }
}
