import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { AppSmtpSettings } from '../utils/smtp-settings.util';

export type SendMailOptions = {
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
};

/**
 * 邮件发送：全站集成表中的 SMTP 使用 {@link sendMailWithAppSmtp}；无多租户场景可仍用环境变量（遗留）。
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

  /** @deprecated 仅兼容旧代码；验证码等请使用全站集成表中的 smtp */
  isEnvSmtpConfigured(): boolean {
    const host = process.env.SMTP_HOST?.trim();
    const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 0;
    const user = process.env.SMTP_USER?.trim();
    const pass = process.env.SMTP_PASS?.trim();
    return !!(host && port && user && pass);
  }

  private getEnvTransporter(): nodemailer.Transporter | null {
    if (this.transporter) return this.transporter;
    const host = process.env.SMTP_HOST?.trim();
    const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 0;
    const user = process.env.SMTP_USER?.trim();
    const pass = process.env.SMTP_PASS?.trim();
    if (!host || !port || !user || !pass) {
      return null;
    }
    const rejectUnauthorized =
      process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== 'false';
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
      tls: { rejectUnauthorized },
    });
    return this.transporter;
  }

  /**
   * 使用 **global_integration_setting（name=smtp）** 中的凭据发信（推荐）。
   */
  async sendMailWithAppSmtp(
    smtp: AppSmtpSettings,
    opts: SendMailOptions,
  ): Promise<void> {
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.port === 465,
      auth: { user: smtp.user, pass: smtp.pass },
      tls: {
        rejectUnauthorized: smtp.tlsRejectUnauthorized !== false,
      },
    });
    const from = opts.from || smtp.from?.trim() || smtp.user;
    await transporter.sendMail({
      from,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      ...(opts.html ? { html: opts.html } : {}),
    });
  }

  /**
   * 遗留：仅用环境变量 SMTP_* 发信。
   */
  async sendMail(opts: SendMailOptions): Promise<boolean> {
    const from =
      opts.from ||
      process.env.SMTP_FROM?.trim() ||
      process.env.SMTP_USER?.trim();
    const t = this.getEnvTransporter();
    if (!t || !from) {
      return false;
    }
    await t.sendMail({
      from,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      ...(opts.html ? { html: opts.html } : {}),
    });
    return true;
  }
}
