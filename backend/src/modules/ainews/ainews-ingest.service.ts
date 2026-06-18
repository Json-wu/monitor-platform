import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AinewsIngestSummarizeService,
  type IngestArticleForSummarize,
  type QuickSummarizeResult,
} from './ainews-ingest-summarize.service';
import { enrichRowsWithArticleImages } from './lib/fetch-article-image';
import { parseFeedItems } from './lib/rss-parse';
import {
  isPresetDomainId,
  MAX_ITEMS_PER_FEED,
  RSS_FEEDS,
  SEED_PRESET_DOMAINS,
} from './rss-config';
import { canonicalUrlForSummaryCache } from './lib/url-cache-key';
import { env } from './lib/env';
import { resolveAinewsAppId } from './ainews-end-user.util';

type ParsedRow = {
  url: string;
  canon: string;
  title: string;
  publishedAt: string;
  source: string;
  rawSummary: string;
  domainIds: string[];
  imageUrl?: string;
};

export type IngestResult = {
  ok: true;
  parsed: number;
  upserted: number;
  newArticles: number;
  articleImagesFetched: number;
  quickSummarize?: QuickSummarizeResult;
};

@Injectable()
export class AinewsIngestService {
  private readonly logger = new Logger(AinewsIngestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly summarize: AinewsIngestSummarizeService,
  ) {}

  async runIngest(): Promise<IngestResult> {
    const byCanon = new Map<string, ParsedRow>();
    const followedDomains = await this.loadAllUsersFollowedPresetDomains();

    for (const domainId of followedDomains) {
      const feedUrls = RSS_FEEDS[domainId] ?? [];
      for (const feedUrl of feedUrls) {
        try {
          const xml = await this.fetchXml(feedUrl, 18_000);
          const items = parseFeedItems(xml, feedUrl).slice(0, MAX_ITEMS_PER_FEED);
          for (const it of items) {
            const canon = canonicalUrlForSummaryCache(it.url);
            if (!canon) continue;

            const existing = byCanon.get(canon);
            const rawSummary = (it.summary ?? '').slice(0, 400);
            if (existing) {
              if (!existing.domainIds.includes(domainId)) {
                existing.domainIds.push(domainId);
              }
              if (!existing.imageUrl && it.imageUrl) {
                existing.imageUrl = it.imageUrl;
              }
              continue;
            }
            byCanon.set(canon, {
              url: it.url,
              canon,
              title: it.title.slice(0, 400),
              publishedAt: it.publishedAt,
              source: it.source.slice(0, 120),
              rawSummary,
              domainIds: [domainId],
              ...(it.imageUrl ? { imageUrl: it.imageUrl } : {}),
            });
          }
        } catch (e) {
          this.logger.warn(`feed failed ${feedUrl}: ${String(e)}`);
        }
      }
    }

    const rows = [...byCanon.values()];
    if (rows.length === 0) {
      return {
        ok: true,
        parsed: 0,
        upserted: 0,
        newArticles: 0,
        articleImagesFetched: 0,
      };
    }

    const canonList = rows.map((r) => r.canon);
    const existingRows = await this.prisma.ainewsArticle.findMany({
      where: { canonicalUrl: { in: canonList } },
      select: { canonicalUrl: true, domains: true, imageUrl: true },
    });

    const existingMap = new Map<
      string,
      { domains: string[]; imageUrl: string | null }
    >();
    for (const row of existingRows) {
      existingMap.set(row.canonicalUrl, {
        domains: row.domains ?? [],
        imageUrl: row.imageUrl ?? null,
      });
    }

    let newArticles = 0;
    for (const r of rows) {
      if (!existingMap.has(r.canon)) {
        newArticles += 1;
      }
      if (!r.imageUrl) {
        const prevImg = existingMap.get(r.canon)?.imageUrl;
        if (prevImg) {
          r.imageUrl = prevImg;
        }
      }
    }

    const maxImagesRaw = env('INGEST_ARTICLE_IMAGE_MAX', '40');
    const articleImagesFetched = await enrichRowsWithArticleImages(rows, {
      max:
        maxImagesRaw === ''
          ? 40
          : Math.max(0, parseInt(maxImagesRaw, 10)),
      concurrency: 5,
    });

    if (newArticles > 0) {
      await this.syncArticleIdSequence();
    }

    for (const r of rows) {
      const prev = existingMap.get(r.canon);
      const prevDomains = prev?.domains ?? [];
      const domains = [...new Set([...prevDomains, ...r.domainIds])];
      const imageUrl = r.imageUrl ?? prev?.imageUrl ?? null;
      const publishedAt = new Date(r.publishedAt);

      await this.prisma.ainewsArticle.upsert({
        where: { canonicalUrl: r.canon },
        create: {
          canonicalUrl: r.canon,
          sourceUrl: r.url,
          title: r.title,
          publishedAt: Number.isNaN(publishedAt.getTime()) ? new Date() : publishedAt,
          source: r.source,
          domains,
          rawSummary: r.rawSummary || null,
          imageUrl,
        },
        update: {
          sourceUrl: r.url,
          title: r.title,
          publishedAt: Number.isNaN(publishedAt.getTime()) ? new Date() : publishedAt,
          source: r.source,
          domains,
          rawSummary: r.rawSummary || null,
          imageUrl,
        },
      });
    }

    const forSummarize: IngestArticleForSummarize[] = rows.map((r) => ({
      canon: r.canon,
      sourceUrl: r.url,
      title: r.title,
      rawSummary: r.rawSummary,
      publishedAt: r.publishedAt,
      isNew: !existingMap.has(r.canon),
    }));
    const quickSummarize = await this.summarize.quickSummarizeAfterIngest(
      forSummarize,
    );

    this.logger.log(
      `ingest done parsed=${rows.length} new=${newArticles} images=${articleImagesFetched} quickSummarize=${quickSummarize.processed}/${quickSummarize.queued}${quickSummarize.skippedReason ? ` (${quickSummarize.skippedReason})` : ''}`,
    );

    return {
      ok: true,
      parsed: rows.length,
      upserted: rows.length,
      newArticles,
      articleImagesFetched,
      quickSummarize,
    };
  }

  /** Supabase 数据导入后 bigserial 序列常未推进，新 INSERT 会撞 id 唯一约束。 */
  private async syncArticleIdSequence(): Promise<void> {
    await this.prisma.$executeRaw`
      SELECT setval(
        pg_get_serial_sequence('articles', 'id'),
        COALESCE((SELECT MAX(id) FROM articles), 1)
      )
    `;
  }

  private async loadAllUsersFollowedPresetDomains(): Promise<string[]> {
    const set = new Set<string>();
    const appId = await resolveAinewsAppId(this.prisma);
    const rows = await this.prisma.endUser.findMany({
      where: { appId },
      select: { ainewsFollowDomains: true },
    });
    for (const row of rows) {
      for (const x of row.ainewsFollowDomains ?? []) {
        const t = x.trim().toLowerCase();
        if (t && isPresetDomainId(t)) {
          set.add(t);
        }
      }
    }
    if (set.size === 0) {
      return [...SEED_PRESET_DOMAINS];
    }
    return [...set];
  }

  private async fetchXml(url: string, ms: number): Promise<string> {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), ms);
    try {
      const r = await fetch(url, {
        signal: ctrl.signal,
        headers: {
          Accept:
            'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
          'User-Agent': env('RSS_FETCH_USER_AGENT', 'IndustryAINews-RSS/1.0 (+ingest)'),
        },
      });
      if (!r.ok) {
        throw new Error(`HTTP ${r.status}`);
      }
      return await r.text();
    } finally {
      clearTimeout(id);
    }
  }
}
