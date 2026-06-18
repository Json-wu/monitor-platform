import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { isPresetDomainId } from './rss-config';
import { idFromUrl } from './url-id';

const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 80;
const LOOKBACK_DAYS = 14;

function matchCustomDomain(custom: string, title: string, summary: string): boolean {
  const q = custom.trim().toLowerCase();
  if (!q) return false;
  return `${title}\n${summary}`.toLowerCase().includes(q);
}

@Injectable()
export class AinewsNewsService {
  constructor(private readonly prisma: PrismaService) {}

  async listNews(input: {
    domains: string[];
    locale?: string;
    limit?: number;
    offset?: number;
    userId?: string;
  }) {
    const trimmed = [
      ...new Set(
        input.domains
          .filter((d) => typeof d === 'string')
          .map((d) => d.trim())
          .filter(Boolean),
      ),
    ];
    if (trimmed.length === 0) {
      return { items: [], locale: input.locale ?? 'en', hasMore: false, nextOffset: 0 };
    }

    const locale = (input.locale ?? 'en').trim() || 'en';
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, typeof input.limit === 'number' ? input.limit : DEFAULT_LIMIT),
    );
    const offset = Math.max(0, typeof input.offset === 'number' ? Math.floor(input.offset) : 0);
    const since = new Date(Date.now() - LOOKBACK_DAYS * 86400_000);

    const presets = [
      ...new Set(
        trimmed.filter((d) => isPresetDomainId(d.toLowerCase())).map((d) => d.toLowerCase()),
      ),
    ];
    const customs = trimmed.filter((d) => !isPresetDomainId(d.toLowerCase()));

    const articleRows = await this.prisma.ainewsArticle.findMany({
      where: { publishedAt: { gte: since } },
      orderBy: { publishedAt: 'desc' },
      take: 500,
    });

    const filtered = articleRows.filter((row) => {
      const presetHit = presets.length > 0 && presets.some((p) => row.domains.includes(p));
      const customHit =
        customs.length > 0 &&
        customs.some((c) => matchCustomDomain(c, row.title, row.rawSummary ?? ''));
      return presetHit || customHit;
    });

    const slice = filtered.slice(offset, offset + limit);
    const hasMore = offset + slice.length < filtered.length;
    const nextOffset = offset + slice.length;
    const canonUrls = slice.map((a) => a.canonicalUrl);

    const cacheRows =
      canonUrls.length > 0
        ? await this.prisma.ainewsArticleSummaryCache.findMany({
            where: { url: { in: canonUrls }, locale },
          })
        : [];
    const cacheByUrl = new Map(cacheRows.map((r) => [r.url, r]));

    let states: Array<{
      canonicalUrl: string;
      liked: boolean;
      disliked: boolean;
      read: boolean;
    }> = [];
    if (input.userId && canonUrls.length > 0) {
      states = await this.prisma.ainewsArticleUserState.findMany({
        where: { userId: input.userId, canonicalUrl: { in: canonUrls } },
        select: { canonicalUrl: true, liked: true, disliked: true, read: true },
      });
    }
    const stateByCanon = new Map(states.map((s) => [s.canonicalUrl, s]));

    const items = slice.map((a) => {
      const cached = cacheByUrl.get(a.canonicalUrl);
      const presetDomain =
        presets.find((p) => a.domains.includes(p)) ??
        customs.find((c) => matchCustomDomain(c, a.title, a.rawSummary ?? '')) ??
        a.domains[0] ??
        'general';
      const st = stateByCanon.get(a.canonicalUrl);
      return {
        id: idFromUrl(a.sourceUrl),
        url: a.sourceUrl,
        title: cached?.title?.trim() || a.title,
        summary: cached?.summary?.trim() || a.rawSummary || '',
        source: a.source,
        publishedAt: a.publishedAt.toISOString(),
        industry: presetDomain,
        dataSource: 'server' as const,
        hasLocalizedSummary: Boolean(cached?.summary?.trim()),
        userState: st ?? { liked: false, disliked: false, read: false },
        ...(a.imageUrl?.trim() ? { imageUrl: a.imageUrl.trim() } : {}),
      };
    });

    return { items, locale, hasMore, nextOffset };
  }
}
