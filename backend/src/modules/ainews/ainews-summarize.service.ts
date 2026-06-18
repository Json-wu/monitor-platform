import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AinewsAccountService } from './ainews-account.service';
import {
  SUMMARY_DAILY_LIMIT_UNLIMITED,
  type EffectiveTier,
} from './ainews-tier.util';
import { canonicalUrlForSummaryCache } from './lib/url-cache-key';
import {
  normalizeSummaryLocale,
  type SummaryLocaleKey,
} from './lib/summary-locale';

type CleanItem = { url: string; title: string; hint: string; canon: string };

const DEFAULT_DEEPSEEK_BASE = 'https://api.deepseek.com';

function utcDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function extractChatCompletionText(data: unknown): string {
  const root = data as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const text = root.choices?.[0]?.message?.content;
  return typeof text === 'string' ? text : '';
}

function parseSummariesFromModel(
  text: string,
): Array<{ url: string; summary: string }> {
  let t = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/im.exec(t);
  if (fence) {
    t = fence[1].trim();
  }
  const parsed = JSON.parse(t) as unknown;
  if (!Array.isArray(parsed)) {
    return [];
  }
  const out: Array<{ url: string; summary: string }> = [];
  for (const row of parsed) {
    if (!row || typeof row !== 'object') continue;
    const o = row as Record<string, unknown>;
    const url = typeof o.url === 'string' ? o.url : '';
    const summary = typeof o.summary === 'string' ? o.summary.trim() : '';
    if (url && summary) out.push({ url, summary });
  }
  return out;
}

@Injectable()
export class AinewsSummarizeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly account: AinewsAccountService,
  ) {}

  async getSummaryUsage(input: {
    endUserId?: string;
    anonUserId?: string;
  }) {
    const resolved = await this.resolveUsageSubject(input);
    const { usageUserId, dailyLimit, tier, unlimited } = resolved;

    const day = new Date(`${utcDateString()}T00:00:00.000Z`);
    const usageRow = await this.prisma.ainewsLlmUsageDaily.findUnique({
      where: { userId_usageDay: { userId: usageUserId, usageDay: day } },
    });
    const usedToday = usageRow?.summarizeCalls ?? 0;
    const remaining = unlimited
      ? null
      : Math.max(0, dailyLimit - usedToday);

    return {
      tier,
      usedToday,
      dailyLimit: unlimited ? null : dailyLimit,
      remaining,
      nearLimit: unlimited
        ? false
        : (remaining ?? 0) <= Math.max(5, Math.floor(dailyLimit * 0.1)),
    };
  }

  async summarizeArticles(input: {
    endUserId?: string;
    anonUserId?: string;
    locale?: string;
    items?: Array<{ url?: string; title?: string; hint?: string }>;
  }) {
    const resolved = await this.resolveUsageSubject(input);
    const { usageUserId, dailyLimit, tier, unlimited } = resolved;

    const deepseekKey = process.env.DEEPSEEK_API_KEY?.trim() ?? '';
    if (!deepseekKey) {
      throw new BadRequestException('DEEPSEEK_API_KEY not configured');
    }

    const summaryLocale: SummaryLocaleKey = normalizeSummaryLocale(input.locale);
    const items = input.items;
    if (!Array.isArray(items) || items.length === 0 || items.length > 12) {
      throw new BadRequestException(
        'items must be a non-empty array (max 12)',
      );
    }

    const cleaned: CleanItem[] = [];
    for (const it of items) {
      const url = typeof it.url === 'string' ? it.url.trim() : '';
      const title = typeof it.title === 'string' ? it.title.trim() : '';
      const hint = typeof it.hint === 'string' ? it.hint.trim() : '';
      if (!url || !title) continue;
      const canon = canonicalUrlForSummaryCache(url);
      if (!canon) continue;
      cleaned.push({
        url,
        title: title.slice(0, 400),
        hint: hint.slice(0, 500),
        canon,
      });
    }
    if (cleaned.length === 0) {
      throw new BadRequestException('no valid items');
    }

    const model = process.env.DEEPSEEK_MODEL?.trim() || 'deepseek-chat';
    const ttlHours = Math.max(
      1,
      parseInt(process.env.SUMMARY_CACHE_TTL_HOURS ?? '168', 10),
    );
    const cutoff = Date.now() - ttlHours * 3600 * 1000;

    const canonUrls = [...new Set(cleaned.map((c) => c.canon))];
    const cacheRows = await this.prisma.ainewsArticleSummaryCache.findMany({
      where: { url: { in: canonUrls }, locale: summaryLocale },
    });

    const cacheMap = new Map<
      string,
      { summary: string; model: string; updatedAt: Date }
    >();
    for (const row of cacheRows) {
      if (row.url && row.summary) {
        cacheMap.set(row.url, {
          summary: row.summary,
          model: row.model ?? '',
          updatedAt: row.updatedAt,
        });
      }
    }

    const cachedSummaries = new Map<string, string>();
    const needLlm: CleanItem[] = [];

    for (const c of cleaned) {
      const hit = cacheMap.get(c.canon);
      const fresh =
        hit && hit.model === model && hit.updatedAt.getTime() >= cutoff;
      if (fresh && hit) {
        cachedSummaries.set(c.url, hit.summary);
      } else {
        needLlm.push(c);
      }
    }

    const day = new Date(`${utcDateString()}T00:00:00.000Z`);
    const usageRow = await this.prisma.ainewsLlmUsageDaily.findUnique({
      where: { userId_usageDay: { userId: usageUserId, usageDay: day } },
    });
    const used = usageRow?.summarizeCalls ?? 0;
    let toCall = needLlm;
    const remaining = unlimited
      ? toCall.length
      : Math.max(0, dailyLimit - used);

    if (!unlimited && toCall.length > remaining) {
      toCall = toCall.slice(0, remaining);
    }

    const llmByUrl = new Map<string, string>();

    if (toCall.length > 0) {
      const userPayload = JSON.stringify(
        toCall.map((c) => ({ url: c.url, title: c.title, hint: c.hint })),
      );
      const { systemContent, userContent } =
        summaryLocale === 'zh'
          ? {
              systemContent:
                '你只输出合法 JSON 数组，元素为对象含 url 与 summary 字符串，无其它文字。',
              userContent:
                `你是中文新闻编辑。根据下列 JSON 数组中的每条新闻的 url、title、hint（RSS 摘要或描述），` +
                `为每条写一句不超过 80 个汉字的中文要点，语气客观、信息密度高。\n` +
                `只输出一个 JSON 数组，不要其它说明或 Markdown。数组元素形如 {"url":"与输入完全一致","summary":"..."}，` +
                `顺序与输入一致，且 url 必须与输入逐字相同。\n\n输入：\n${userPayload}`,
            }
          : {
              systemContent:
                'Output only a valid JSON array of objects with url and summary string fields. No other text.',
              userContent:
                `You are a concise news editor. For each item in the JSON array (fields url, title, hint — hint may be RSS description), ` +
                `write one objective one-line summary in English, at most about 120 characters, informative tone.\n` +
                `Output only one JSON array; no Markdown fences or explanation. Each element: {"url":"exact match from input","summary":"..."}, ` +
                `same order as input; url must match character-for-character.\n\nInput:\n${userPayload}`,
            };

      const apiBase = (
        process.env.DEEPSEEK_API_BASE ?? DEFAULT_DEEPSEEK_BASE
      ).replace(/\/$/, '');
      const llmRes = await fetch(`${apiBase}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${deepseekKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemContent },
            { role: 'user', content: userContent },
          ],
          temperature: 0.35,
          max_tokens: 2048,
        }),
      });

      if (!llmRes.ok) {
        const errText = await llmRes.text();
        throw new BadRequestException(
          `llm request failed: ${llmRes.status} ${errText.slice(0, 120)}`,
        );
      }

      const llmJson: unknown = await llmRes.json();
      const rawText = extractChatCompletionText(llmJson);
      if (!rawText) {
        throw new BadRequestException('empty model output');
      }

      let parsed: Array<{ url: string; summary: string }>;
      try {
        parsed = parseSummariesFromModel(rawText);
      } catch {
        throw new BadRequestException('invalid model json');
      }

      const now = new Date();
      for (const row of parsed) {
        llmByUrl.set(row.url, row.summary);
        const canon = canonicalUrlForSummaryCache(row.url);
        if (canon) {
          await this.prisma.ainewsArticleSummaryCache.upsert({
            where: { url_locale: { url: canon, locale: summaryLocale } },
            create: {
              url: canon,
              locale: summaryLocale,
              summary: row.summary,
              model,
              updatedAt: now,
            },
            update: { summary: row.summary, model, updatedAt: now },
          });
        }
      }

      const nextCount = used + toCall.length;
      await this.prisma.ainewsLlmUsageDaily.upsert({
        where: { userId_usageDay: { userId: usageUserId, usageDay: day } },
        create: {
          userId: usageUserId,
          usageDay: day,
          summarizeCalls: nextCount,
        },
        update: { summarizeCalls: nextCount },
      });
    }

    const out: Array<{ url: string; summary: string }> = [];
    for (const c of cleaned) {
      const summary =
        cachedSummaries.get(c.url) ?? llmByUrl.get(c.url) ?? c.hint;
      out.push({ url: c.url, summary });
    }

    const llmDelta = toCall.length > 0 ? toCall.length : 0;
    const usedToday = used + llmDelta;
    const remainingAfter = unlimited
      ? null
      : Math.max(0, dailyLimit - usedToday);

    return {
      summaries: out,
      tier,
      usage: {
        usedToday,
        dailyLimit: unlimited ? null : dailyLimit,
        remaining: unlimited ? null : remainingAfter,
        nearLimit: unlimited
          ? false
          : (remainingAfter ?? 0) <=
            Math.max(5, Math.floor(dailyLimit * 0.1)),
      },
    };
  }

  private async resolveUsageSubject(input: {
    endUserId?: string;
    anonUserId?: string;
  }) {
    const anonUuid =
      input.anonUserId &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        input.anonUserId,
      )
        ? input.anonUserId
        : '';

    let usageUserId: string;
    let dailyLimit: number;
    let tier: EffectiveTier;

    if (input.endUserId) {
      const endUser = await this.prisma.endUser.findUnique({
        where: { id: input.endUserId },
        select: { email: true },
      });
      const account = await this.account.resolveForEndUser(
        input.endUserId,
        endUser?.email ?? null,
      );
      tier = account.tier;
      dailyLimit = account.limits.summariesPerDay;
      usageUserId = input.endUserId;
    } else if (anonUuid) {
      const account = this.account.resolveAnonAccount();
      tier = account.tier;
      dailyLimit = account.limits.summariesPerDay;
      usageUserId = anonUuid;
    } else {
      throw new UnauthorizedException('Not signed in');
    }

    const envDailyFallback = Math.max(
      1,
      parseInt(process.env.SUMMARY_DAILY_LLM_ITEMS_PER_USER ?? '120', 10),
    );
    if (dailyLimit <= 0) {
      dailyLimit = envDailyFallback;
    }
    const unlimited = dailyLimit >= SUMMARY_DAILY_LIMIT_UNLIMITED - 1000;

    return { usageUserId, dailyLimit, tier, unlimited };
  }
}
