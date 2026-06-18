import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AinewsAccountService } from './ainews-account.service';

export type ExtensionPrefsRow = {
  user_id: string;
  industry_ids: string[];
  reminder_mode: string;
  ui_theme: string;
  onboarding_complete: boolean;
  follow_keywords: string[];
  timezone: string;
  ui_lang: string;
  reminder_email: string;
  email_digest_opt_out: boolean;
  updated_at: string;
};

@Injectable()
export class AinewsPreferencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly account: AinewsAccountService,
  ) {}

  async getForEndUser(endUserId: string): Promise<ExtensionPrefsRow | null> {
    const row = await this.prisma.ainewsExtensionPreferences.findUnique({
      where: { endUserId },
    });
    if (!row) return null;
    return this.toRow(row);
  }

  async upsertForEndUser(
    endUserId: string,
    patch: Partial<{
      industryIds: string[];
      reminderMode: string;
      uiTheme: string;
      onboardingComplete: boolean;
      followKeywords: string[];
      timezone: string;
      uiLang: string;
      reminderEmail: string;
      emailDigestOptOut: boolean;
      isPro: boolean;
    }>,
  ): Promise<ExtensionPrefsRow> {
    const endUser = await this.prisma.endUser.findUnique({
      where: { id: endUserId },
      select: { email: true },
    });
    if (!endUser) {
      throw new UnauthorizedException('User not found');
    }

    const account = await this.account.resolveForEndUser(
      endUserId,
      endUser.email,
    );

    const now = new Date();
    const row = await this.prisma.ainewsExtensionPreferences.upsert({
      where: { endUserId },
      create: {
        endUserId,
        industryIds: patch.industryIds ?? [],
        reminderMode: patch.reminderMode ?? 'every2h',
        uiTheme: patch.uiTheme ?? 'light',
        onboardingComplete: patch.onboardingComplete ?? false,
        followKeywords: patch.followKeywords ?? [],
        timezone: patch.timezone ?? 'UTC',
        uiLang: patch.uiLang ?? 'en',
        reminderEmail: patch.reminderEmail ?? endUser.email,
        emailDigestOptOut: patch.emailDigestOptOut ?? false,
        isPro: patch.isPro ?? account.tier !== 'free',
        updatedAt: now,
      },
      update: {
        ...(patch.industryIds !== undefined
          ? { industryIds: patch.industryIds }
          : {}),
        ...(patch.reminderMode !== undefined
          ? { reminderMode: patch.reminderMode }
          : {}),
        ...(patch.uiTheme !== undefined ? { uiTheme: patch.uiTheme } : {}),
        ...(patch.onboardingComplete !== undefined
          ? { onboardingComplete: patch.onboardingComplete }
          : {}),
        ...(patch.followKeywords !== undefined
          ? { followKeywords: patch.followKeywords }
          : {}),
        ...(patch.timezone !== undefined ? { timezone: patch.timezone } : {}),
        ...(patch.uiLang !== undefined ? { uiLang: patch.uiLang } : {}),
        ...(patch.reminderEmail !== undefined
          ? { reminderEmail: patch.reminderEmail }
          : {}),
        ...(patch.emailDigestOptOut !== undefined
          ? { emailDigestOptOut: patch.emailDigestOptOut }
          : {}),
        ...(patch.isPro !== undefined ? { isPro: patch.isPro } : {}),
        updatedAt: now,
      },
    });

    return this.toRow(row);
  }

  private toRow(row: {
    endUserId: string;
    industryIds: string[];
    reminderMode: string;
    uiTheme: string;
    onboardingComplete: boolean;
    followKeywords: string[];
    timezone: string;
    uiLang: string;
    reminderEmail: string;
    emailDigestOptOut: boolean;
    updatedAt: Date;
  }): ExtensionPrefsRow {
    return {
      user_id: row.endUserId,
      industry_ids: row.industryIds,
      reminder_mode: row.reminderMode,
      ui_theme: row.uiTheme,
      onboarding_complete: row.onboardingComplete,
      follow_keywords: row.followKeywords,
      timezone: row.timezone,
      ui_lang: row.uiLang,
      reminder_email: row.reminderEmail,
      email_digest_opt_out: row.emailDigestOptOut,
      updated_at: row.updatedAt.toISOString(),
    };
  }
}
