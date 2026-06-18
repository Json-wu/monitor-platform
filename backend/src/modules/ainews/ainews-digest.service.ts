import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeArticleLocale, type ArticleLocaleKey } from './lib/article-locale';
import {
  briefToHtml,
  briefToPlainText,
  generateDailyDigestBrief,
} from './lib/digest-llm';
import {
  digestUiStrings,
  trialDigestCopy,
} from './lib/digest-locale-strings';
import {
  isDailyDigestSendWindow,
  localDateTimeParts,
  NEWS_RECENCY_HOURS,
  normalizeTimeZone,
  sinceIsoForRecencyHours,
} from './lib/digest-timezone';
import { hmacSha256Hex } from './lib/hmac-user';
import { env } from './lib/env';
import {
  collectDigestArticlesFromDb,
  groupArticlesByDomain,
} from './ainews-digest-collect';
import { resolveAinewsAppId } from './ainews-end-user.util';
import { findUnlimitedSubscriberUserIds } from './ainews-subscription.util';

const AIVELO_BRAND_TAGLINE =
  'Mass-scaling human potential through seamless AI.';
const AIVELO_BRAND_FOOTER_HTML = `<p style="margin-top:1.75em;padding-top:1em;border-top:1px solid #e2e8f0;color:#475569;font-size:13px;line-height:1.55;text-align:center;">${escHtml(AIVELO_BRAND_TAGLINE)}<br/><span style="color:#0f172a;font-weight:600;">— Aivelo</span></p>`;
const AIVELO_BRAND_FOOTER_TEXT = `\n\n${AIVELO_BRAND_TAGLINE}\n— Aivelo`;

type DigestMode = 'daily' | 'trial';

type PrefsRow = {
  endUserId: string;
  industryIds: string[];
  reminderEmail: string;
  newsMockOnly: boolean;
  lastEmailDigestAt: Date | null;
  lastDailyDigestDate: Date | null;
  emailDigestTrialSentAt: Date | null;
  emailDigestOptOut: boolean;
  timezone: string;
  uiLang: string;
};

export type DigestRunOptions = {
  force?: boolean;
  endUserId?: string;
  to?: string;
};

export type DigestRunResult = {
  sent: number;
  sentDaily: number;
  sentTrial: number;
  skipped: number;
  checked: number;
  errors: string[];
  force: boolean;
  reason?: string;
  skipReasons?: string[];
};

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function validDigestEmail(s: string): boolean {
  const t = s.trim();
  return t.length > 3 && t.includes('@') && !t.includes(' ');
}

function dateKeyFromDate(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

function parseDateKey(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

function buildHtmlEmail(params: {
  briefHtml: string;
  complianceHtml: string;
  unsubHtml?: string;
  locale: ArticleLocaleKey;
}): string {
  const ui = digestUiStrings(params.locale);
  const foot = params.unsubHtml
    ? `<p style="color:#94a3b8;font-size:12px;margin-top:2em;">${params.unsubHtml}</p>`
    : `<p style="color:#94a3b8;font-size:12px;margin-top:2em;">${escHtml(ui.unsubscribeSettings)}</p>`;
  return `<!DOCTYPE html><html lang="${ui.htmlLang}"><head><meta charset="utf-8"/></head><body style="font-family:system-ui,sans-serif;line-height:1.55;color:#0f172a;max-width:640px;margin:0 auto;padding:1em;">
${params.briefHtml}
<p style="color:#64748b;font-size:12px;margin-top:1.5em;line-height:1.55;">${params.complianceHtml}</p>
${foot}
${AIVELO_BRAND_FOOTER_HTML}
</body></html>`;
}

function buildPlainEmail(params: {
  briefText: string;
  complianceText: string;
  unsubText?: string;
  locale: ArticleLocaleKey;
}): string {
  const ui = digestUiStrings(params.locale);
  const tail = params.unsubText
    ? `\n\n${params.unsubText}`
    : `\n\n${ui.unsubscribeSettings}`;
  return `${params.briefText}\n\n---\n\n${params.complianceText}${tail}${AIVELO_BRAND_FOOTER_TEXT}`;
}

async function sendResend(params: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<{ ok: true } | { ok: false; status: number; body: string }> {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: params.from,
      to: [params.to],
      subject: params.subject,
      html: params.html,
      text: params.text,
    }),
  });
  const body = await r.text();
  if (!r.ok) {
    return { ok: false, status: r.status, body };
  }
  return { ok: true };
}

@Injectable()
export class AinewsDigestService {
  private readonly logger = new Logger(AinewsDigestService.name);

  constructor(private readonly prisma: PrismaService) {}

  async runDigest(options: DigestRunOptions = {}): Promise<DigestRunResult> {
    const forceSend = options.force === true;
    const forceTo =
      forceSend &&
      typeof options.to === 'string' &&
      validDigestEmail(options.to)
        ? options.to.trim()
        : '';
    const onlyUserId =
      typeof options.endUserId === 'string' && options.endUserId.trim().length > 0
        ? options.endUserId.trim()
        : '';

    const resendKey = env('RESEND_API_KEY');
    const emailFrom = env('EMAIL_FROM', 'Aivelo <digest@aivelo.net>');

    if (/@resend\.dev>/i.test(emailFrom) || emailFrom.includes('onboarding@resend')) {
      throw new Error(
        'EMAIL_FROM must use your verified domain (e.g. Aivelo <digest@aivelo.net>)',
      );
    }
    if (!resendKey) {
      throw new Error('RESEND_API_KEY not set');
    }
    if (!env('DEEPSEEK_API_KEY')) {
      throw new Error('DEEPSEEK_API_KEY not set');
    }

    const now = new Date();
    const sinceIso = sinceIsoForRecencyHours(NEWS_RECENCY_HOURS, now);
    const baseUrl = env('AINEWS_PUBLIC_API_URL', env('API_EXTERNAL_URL', 'http://localhost:4000')).replace(/\/$/, '');

    const paidDigestUserIds = await findUnlimitedSubscriberUserIds(this.prisma);
    const unlimitedSet = new Set(paidDigestUserIds);

    const dailyRows =
      paidDigestUserIds.length > 0
        ? await this.prisma.ainewsExtensionPreferences.findMany({
            where: {
              endUserId: { in: paidDigestUserIds },
              newsMockOnly: false,
              emailDigestOptOut: false,
            },
          })
        : [];

    const trialRows = await this.prisma.ainewsExtensionPreferences.findMany({
      where: {
        newsMockOnly: false,
        emailDigestOptOut: false,
        emailDigestTrialSentAt: null,
      },
    });

    const trialFromPrefs = trialRows.filter((r) => !unlimitedSet.has(r.endUserId));
    const trialBootstrapped = await this.bootstrapTrialPrefsFromAnon(unlimitedSet);
    const trialByUser = new Map<string, PrefsRow>();
    for (const r of [...trialFromPrefs, ...trialBootstrapped]) {
      if (!unlimitedSet.has(r.endUserId) && !r.emailDigestTrialSentAt) {
        trialByUser.set(r.endUserId, this.toPrefsRow(r));
      }
    }

    type QueueItem = { row: PrefsRow; mode: DigestMode };
    const queue: QueueItem[] = [
      ...dailyRows.map((row) => ({
        row: this.toPrefsRow(row),
        mode: 'daily' as const,
      })),
      ...[...trialByUser.values()].map((row) => ({
        row,
        mode: 'trial' as const,
      })),
    ];

    const list = queue.filter(({ row }) =>
      onlyUserId ? row.endUserId === onlyUserId : true,
    );

    if (list.length === 0) {
      return {
        sent: 0,
        sentDaily: 0,
        sentTrial: 0,
        skipped: 0,
        checked: 0,
        errors: [],
        force: forceSend,
        reason: 'no_digest_eligible_users',
      };
    }

    let sent = 0;
    let sentDaily = 0;
    let sentTrial = 0;
    let skipped = 0;
    const errors: string[] = [];
    const skipReasons: string[] = [];

    for (const { row, mode } of list) {
      const { timezone, locale } = await this.resolveTimezoneAndLocale(row);
      const { dateKey } = localDateTimeParts(timezone, now);

      if (mode === 'daily') {
        if (!forceSend && !isDailyDigestSendWindow(timezone, now)) {
          skipped += 1;
          continue;
        }
        if (
          !forceSend &&
          dateKeyFromDate(row.lastDailyDigestDate) === dateKey
        ) {
          skipped += 1;
          continue;
        }
      } else if (!forceSend && row.emailDigestTrialSentAt) {
        skipped += 1;
        skipReasons.push(`${row.endUserId}:trial_already_sent`);
        continue;
      }

      let to =
        forceTo ||
        (await this.resolveUserEmail(row.endUserId, row.reminderEmail));
      if (!to) {
        skipped += 1;
        skipReasons.push(`${row.endUserId}:no_email`);
        continue;
      }

      if (forceTo) {
        await this.prisma.ainewsExtensionPreferences.update({
          where: { endUserId: row.endUserId },
          data: { reminderEmail: forceTo },
        });
      }

      const industries = await this.resolveFollowDomains(
        row.endUserId,
        row.industryIds ?? [],
      );
      if (industries.length === 0) {
        skipped += 1;
        skipReasons.push(`${row.endUserId}:no_industries`);
        continue;
      }

      let articles;
      try {
        articles = await collectDigestArticlesFromDb(this.prisma, {
          domains: industries,
          sinceIso,
          locale,
          maxArticles: 100,
        });
      } catch (e) {
        errors.push(`${row.endUserId}:collect:${String(e)}`);
        continue;
      }
      if (articles.length === 0) {
        skipped += 1;
        skipReasons.push(`${row.endUserId}:no_articles_24h`);
        continue;
      }

      const grouped = groupArticlesByDomain(articles, industries);

      let brief;
      try {
        brief = await generateDailyDigestBrief(grouped, locale, dateKey);
      } catch (e) {
        errors.push(`${row.endUserId}:llm:${String(e)}`);
        continue;
      }

      const briefHtml = briefToHtml(brief, locale, escHtml);
      const briefText = briefToPlainText(brief, locale);

      await this.prisma.ainewsEmailDigestBrief.upsert({
        where: {
          endUserId_digestDate: {
            endUserId: row.endUserId,
            digestDate: parseDateKey(dateKey),
          },
        },
        create: {
          endUserId: row.endUserId,
          digestDate: parseDateKey(dateKey),
          briefHtml,
          briefText,
        },
        update: {
          briefHtml,
          briefText,
        },
      });

      const ui = digestUiStrings(locale);
      const trialCopy = trialDigestCopy(locale);
      const unsubSecret = env('EMAIL_UNSUBSCRIBE_SECRET');
      let unsubHtml: string | undefined;
      let unsubText: string | undefined;
      if (unsubSecret.length >= 8) {
        const sig = await hmacSha256Hex(unsubSecret, row.endUserId);
        const u = `${baseUrl}/api/public/ainews/email-unsubscribe?uid=${encodeURIComponent(row.endUserId)}&sig=${encodeURIComponent(sig)}`;
        unsubHtml = `<a href="${escHtml(u)}" style="color:#64748b;">${escHtml(ui.unsubscribeLink)}</a>`;
        unsubText = `${ui.unsubscribeLink}: ${u}`;
      }

      const complianceHtml = escHtml(
        mode === 'trial' ? trialCopy.compliance : ui.compliance(timezone),
      );
      const complianceText =
        mode === 'trial' ? trialCopy.compliance : ui.compliancePlain(timezone);

      const html = buildHtmlEmail({
        briefHtml,
        complianceHtml,
        unsubHtml,
        locale,
      });
      const text = buildPlainEmail({
        briefText,
        complianceText,
        unsubText,
        locale,
      });
      const subjectPrefix = mode === 'trial' ? trialCopy.subjectPrefix : '';
      const subject = `${subjectPrefix}${brief.title} · ${ui.subjectSuffix}`;

      const res = await sendResend({
        apiKey: resendKey,
        from: emailFrom,
        to,
        subject,
        html,
        text,
      });
      if (!res.ok) {
        errors.push(
          `${row.endUserId}:resend:${res.status}:${res.body.slice(0, 200)}`,
        );
        continue;
      }

      const updatePatch: {
        lastEmailDigestAt: Date;
        lastDailyDigestDate?: Date;
        emailDigestTrialSentAt?: Date;
      } = { lastEmailDigestAt: now };
      if (mode === 'daily' && !forceSend) {
        updatePatch.lastDailyDigestDate = parseDateKey(dateKey);
      }
      if (mode === 'trial') {
        updatePatch.emailDigestTrialSentAt = now;
      }
      await this.prisma.ainewsExtensionPreferences.update({
        where: { endUserId: row.endUserId },
        data: updatePatch,
      });

      sent += 1;
      if (mode === 'trial') {
        sentTrial += 1;
      } else {
        sentDaily += 1;
      }
    }

    this.logger.log(
      `digest sent=${sent} daily=${sentDaily} trial=${sentTrial} skipped=${skipped}`,
    );

    return {
      sent,
      sentDaily,
      sentTrial,
      skipped,
      checked: list.length,
      errors,
      force: forceSend,
      ...(skipReasons.length > 0 ? { skipReasons } : {}),
    };
  }

  private toPrefsRow(row: {
    endUserId: string;
    industryIds: string[];
    reminderEmail: string;
    newsMockOnly: boolean;
    lastEmailDigestAt: Date | null;
    lastDailyDigestDate: Date | null;
    emailDigestTrialSentAt: Date | null;
    emailDigestOptOut: boolean;
    timezone: string;
    uiLang: string;
  }): PrefsRow {
    return {
      endUserId: row.endUserId,
      industryIds: row.industryIds ?? [],
      reminderEmail: row.reminderEmail ?? '',
      newsMockOnly: row.newsMockOnly,
      lastEmailDigestAt: row.lastEmailDigestAt,
      lastDailyDigestDate: row.lastDailyDigestDate,
      emailDigestTrialSentAt: row.emailDigestTrialSentAt,
      emailDigestOptOut: row.emailDigestOptOut,
      timezone: row.timezone ?? 'UTC',
      uiLang: row.uiLang ?? 'en',
    };
  }

  private async resolveUserEmail(
    endUserId: string,
    reminderEmail: string,
  ): Promise<string> {
    if (validDigestEmail(reminderEmail)) {
      return reminderEmail.trim();
    }
    const endUser = await this.prisma.endUser.findUnique({
      where: { id: endUserId },
      select: { email: true },
    });
    const email = endUser?.email?.trim() ?? '';
    return validDigestEmail(email) ? email : '';
  }

  private async resolveFollowDomains(
    endUserId: string,
    industryIds: string[],
  ): Promise<string[]> {
    const fromPrefs = industryIds.filter(
      (x) => typeof x === 'string' && x.trim().length > 0,
    );
    if (fromPrefs.length > 0) {
      return fromPrefs;
    }
    const endUser = await this.prisma.endUser.findUnique({
      where: { id: endUserId },
      select: { ainewsFollowDomains: true },
    });
    if (endUser?.ainewsFollowDomains?.length) {
      return endUser.ainewsFollowDomains.filter(
        (x) => typeof x === 'string' && x.trim().length > 0,
      );
    }
    return [];
  }

  private async resolveTimezoneAndLocale(
    row: PrefsRow,
  ): Promise<{ timezone: string; locale: ArticleLocaleKey }> {
    const endUser = await this.prisma.endUser.findUnique({
      where: { id: row.endUserId },
      select: { ainewsTimezone: true, ainewsUiLang: true },
    });

    let timezone = normalizeTimeZone(row.timezone);
    if (endUser?.ainewsTimezone?.trim()) {
      timezone = normalizeTimeZone(endUser.ainewsTimezone);
    }

    const prefsLang = row.uiLang?.trim();
    const profileLang = endUser?.ainewsUiLang?.trim();
    const locale = normalizeArticleLocale(profileLang || prefsLang || 'en');

    return { timezone, locale };
  }

  private async bootstrapTrialPrefsFromAnon(
    unlimitedSet: Set<string>,
  ): Promise<
    Array<{
      endUserId: string;
      industryIds: string[];
      reminderEmail: string;
      newsMockOnly: boolean;
      lastEmailDigestAt: Date | null;
      lastDailyDigestDate: Date | null;
      emailDigestTrialSentAt: Date | null;
      emailDigestOptOut: boolean;
      timezone: string;
      uiLang: string;
    }>
  > {
    const appId = await resolveAinewsAppId(this.prisma);
    const profileRows = await this.prisma.endUser.findMany({
      where: {
        appId,
        ainewsEmail: { not: '' },
      },
      orderBy: { lastActiveAt: 'desc' },
      select: {
        id: true,
        email: true,
        ainewsEmail: true,
        ainewsTimezone: true,
        ainewsUiLang: true,
        ainewsFollowDomains: true,
      },
    });

    const out: Array<{
      endUserId: string;
      industryIds: string[];
      reminderEmail: string;
      newsMockOnly: boolean;
      lastEmailDigestAt: Date | null;
      lastDailyDigestDate: Date | null;
      emailDigestTrialSentAt: Date | null;
      emailDigestOptOut: boolean;
      timezone: string;
      uiLang: string;
    }> = [];
    const seen = new Set<string>();

    for (const row of profileRows) {
      const endUserId = row.id;
      if (!endUserId || seen.has(endUserId) || unlimitedSet.has(endUserId)) {
        continue;
      }
      seen.add(endUserId);

      const existing = await this.prisma.ainewsExtensionPreferences.findUnique({
        where: { endUserId },
        select: { endUserId: true },
      });
      if (existing) continue;

      const contactEmail = row.ainewsEmail?.trim() || row.email?.trim() || '';
      if (!validDigestEmail(contactEmail)) continue;
      if (contactEmail.endsWith('@ainews.internal')) continue;

      const industryIds = (row.ainewsFollowDomains ?? []).filter(
        (x): x is string => typeof x === 'string',
      );

      const inserted = await this.prisma.ainewsExtensionPreferences.create({
        data: {
          endUserId,
          industryIds,
          reminderEmail: contactEmail,
          isPro: false,
          reminderMode: 'every2h',
          newsMockOnly: false,
          uiTheme: 'light',
          onboardingComplete: industryIds.length > 0,
          emailDigestOptOut: false,
          timezone: row.ainewsTimezone?.trim() || 'UTC',
          uiLang: row.ainewsUiLang?.trim() || 'en',
        },
      });
      out.push(inserted);
    }
    return out;
  }
}
