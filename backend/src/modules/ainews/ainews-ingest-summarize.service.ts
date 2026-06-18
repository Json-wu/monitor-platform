import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import {
  normalizeArticleLocale,
  resolveIngestTargetLocales,
  type ArticleLocaleKey,
} from './lib/article-locale';
import {
  generateLocaleSummariesForIngest,
  toLlmInput,
  type ArticleLlmInput,
  type CacheContentByCanon,
} from './lib/article-llm';
import { resolveAinewsAppId } from './ainews-end-user.util';
import { env } from './lib/env';
import { canonicalUrlForSummaryCache } from './lib/url-cache-key';

const JOB_NAME = 'ingest-article-summaries';
const CACHE_CHUNK = 30;
const SCAN_PAGE_SIZE = 200;
const MAX_ARTICLES_SCANNED = 5000;

export type IngestArticleForSummarize = {
  canon: string;
  sourceUrl: string;
  title: string;
  rawSummary: string;
  publishedAt: string;
  isNew: boolean;
};

export type QuickSummarizeResult = {
  activeLocales: ArticleLocaleKey[];
  candidates: number;
  queued: number;
  processed: number;
  cacheRows: number;
  skippedReason?: string;
};

export type BatchSummarizeResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  activeLocales: ArticleLocaleKey[];
  articlesScanned: number;
  missingFound: number;
  llmQueued: number;
  llmProcessed: number;
  localeCacheRows: number;
  cacheUpsertError: string | null;
};

type JobLockResult =
  | { acquired: true; workerId: string; lockedUntil: string }
  | { acquired: false; lockedUntil: string | null };

@Injectable()
export class AinewsIngestSummarizeService {
  private readonly logger = new Logger(AinewsIngestSummarizeService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** 汇总 end_user + extension_preferences 中的界面语言（不含默认 zh/en）。 */
  async loadActiveUserLocales(): Promise<ArticleLocaleKey[]> {
    const set = new Set<ArticleLocaleKey>();
    const appId = await resolveAinewsAppId(this.prisma);

    const endUserRows = await this.prisma.endUser.findMany({
      where: { appId, ainewsUiLang: { not: '' } },
      select: { ainewsUiLang: true },
    });
    for (const row of endUserRows) {
      this.addLocale(set, row.ainewsUiLang);
    }

    const prefRows = await this.prisma.ainewsExtensionPreferences.findMany({
      where: { uiLang: { not: '' } },
      select: { uiLang: true },
    });
    for (const row of prefRows) {
      this.addLocale(set, row.uiLang);
    }

    return [...set].sort();
  }

  /** 入库摘要目标语言：默认 zh+en，另有用户语言时追加。 */
  async resolveTargetLocales(): Promise<ArticleLocaleKey[]> {
    return resolveIngestTargetLocales(await this.loadActiveUserLocales());
  }

  async loadCacheContentByCanon(
    canons: string[],
    locales: ArticleLocaleKey[],
  ): Promise<CacheContentByCanon> {
    const byCanon: CacheContentByCanon = new Map();
    if (canons.length === 0 || locales.length === 0) {
      return byCanon;
    }

    for (let i = 0; i < canons.length; i += CACHE_CHUNK) {
      const chunk = canons.slice(i, i + CACHE_CHUNK);
      let hits;
      try {
        hits = await this.prisma.ainewsArticleSummaryCache.findMany({
          where: {
            url: { in: chunk },
            locale: { in: locales },
          },
          select: { url: true, locale: true, title: true, summary: true },
        });
      } catch (e) {
        this.logger.warn(
          `load cache chunk failed chunkSize=${chunk.length}: ${String(e)}`,
        );
        continue;
      }

      for (const row of hits) {
        if (!row.url || !row.summary?.trim()) {
          continue;
        }
        const key = canonicalUrlForSummaryCache(row.url) || row.url;
        let byLoc = byCanon.get(key);
        if (!byLoc) {
          byLoc = new Map();
          byCanon.set(key, byLoc);
        }
        byLoc.set(row.locale, {
          title: (row.title ?? '').trim(),
          summary: row.summary.trim(),
        });
      }
    }
    return byCanon;
  }

  async loadArticlesMissingLocaleCache(opts: {
    lookbackDays: number;
    scanLimit: number;
    targetLocales: ArticleLocaleKey[];
  }): Promise<{
    articles: Array<{
      canonical_url: string;
      source_url: string;
      title: string;
      raw_summary: string | null;
    }>;
    scanned: number;
  }> {
    const targetLocales = [...new Set(opts.targetLocales)];
    if (targetLocales.length === 0) {
      return { articles: [], scanned: 0 };
    }

    const lookbackDays = Math.max(1, opts.lookbackDays);
    const scanLimit = Math.max(1, opts.scanLimit);
    const since = new Date(Date.now() - lookbackDays * 86_400_000);

    const missing: Array<{
      canonical_url: string;
      source_url: string;
      title: string;
      raw_summary: string | null;
    }> = [];
    let scanned = 0;
    let offset = 0;

    while (missing.length < scanLimit && scanned < MAX_ARTICLES_SCANNED) {
      const pageRows = await this.prisma.ainewsArticle.findMany({
        where: {
          OR: [{ publishedAt: { gte: since } }, { createdAt: { gte: since } }],
        },
        orderBy: { publishedAt: 'desc' },
        skip: offset,
        take: SCAN_PAGE_SIZE,
        select: {
          canonicalUrl: true,
          sourceUrl: true,
          title: true,
          rawSummary: true,
        },
      });

      if (pageRows.length === 0) {
        break;
      }

      scanned += pageRows.length;
      const canons = pageRows
        .map(
          (r) =>
            canonicalUrlForSummaryCache(r.canonicalUrl) || r.canonicalUrl,
        )
        .filter(Boolean);

      const cachedContent = await this.loadCacheContentByCanon(
        canons,
        targetLocales,
      );
      const cachedByCanon = new Map<string, Set<string>>();
      for (const [canon, byLoc] of cachedContent) {
        cachedByCanon.set(canon, new Set(byLoc.keys()));
      }

      for (const r of pageRows) {
        if (missing.length >= scanLimit) {
          break;
        }
        const canon =
          canonicalUrlForSummaryCache(r.canonicalUrl) || r.canonicalUrl;
        if (!canon || !this.isMissingAnyLocale(canon, targetLocales, cachedByCanon)) {
          continue;
        }
        missing.push({
          canonical_url: r.canonicalUrl,
          source_url: r.sourceUrl,
          title: r.title,
          raw_summary: r.rawSummary,
        });
      }

      if (pageRows.length < SCAN_PAGE_SIZE) {
        break;
      }
      offset += SCAN_PAGE_SIZE;
    }

    return { articles: missing, scanned };
  }

  async upsertCacheRows(
    rows: Array<{
      canon: string;
      locale: string;
      title: string;
      summary: string;
    }>,
  ): Promise<{ upserted: number; error: string | null }> {
    if (rows.length === 0) {
      return { upserted: 0, error: null };
    }
    const model = env('DEEPSEEK_MODEL', 'deepseek-chat');
    let upserted = 0;
    let lastError: string | null = null;

    for (const r of rows) {
      try {
        await this.prisma.ainewsArticleSummaryCache.upsert({
          where: { url_locale: { url: r.canon, locale: r.locale } },
          create: {
            url: r.canon,
            locale: r.locale,
            title: r.title,
            summary: r.summary,
            model,
          },
          update: {
            title: r.title,
            summary: r.summary,
            model,
          },
        });
        upserted += 1;
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
        this.logger.warn(`cache upsert failed ${r.canon}/${r.locale}: ${lastError}`);
      }
    }
    return { upserted, error: lastError };
  }

  /** RSS 入库后即时摘要：仅新文章；默认生成 zh/en 标题+摘要，有其它语言用户时再追加。 */
  async quickSummarizeAfterIngest(
    articles: IngestArticleForSummarize[],
  ): Promise<QuickSummarizeResult> {
    const empty: QuickSummarizeResult = {
      activeLocales: [],
      candidates: articles.length,
      queued: 0,
      processed: 0,
      cacheRows: 0,
    };

    const limit = Math.max(
      0,
      parseInt(env('INGEST_QUICK_SUMMARIZE_LIMIT', '8'), 10),
    );
    if (limit === 0) {
      return { ...empty, skippedReason: 'disabled' };
    }

    if (!env('DEEPSEEK_API_KEY').trim()) {
      return { ...empty, skippedReason: 'no_deepseek' };
    }

    const newArticles = articles.filter((a) => a.isNew);
    if (newArticles.length === 0) {
      return { ...empty, skippedReason: 'no_new_articles' };
    }

    const targetLocales = await this.resolveTargetLocales();

    const sorted = [...newArticles].sort(
      (a, b) =>
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
    );

    const canons = sorted.map((a) => a.canon);
    const cached = await this.loadCacheContentByCanon(canons, targetLocales);

    const forLlm: ArticleLlmInput[] = [];
    for (const a of sorted) {
      if (forLlm.length >= limit) {
        break;
      }
      if (!this.isMissingAnyLocaleInContent(a.canon, targetLocales, cached)) {
        continue;
      }
      const inp = toLlmInput(a.sourceUrl, a.title, a.rawSummary, a.canon);
      if (inp) {
        forLlm.push(inp);
      }
    }

    if (forLlm.length === 0) {
      return {
        activeLocales: targetLocales,
        candidates: sorted.length,
        queued: 0,
        processed: 0,
        cacheRows: 0,
        skippedReason: 'all_cached',
      };
    }

    const loadCache = (c: string[], locs: ArticleLocaleKey[]) =>
      this.loadCacheContentByCanon(c, locs);
    const { cacheRows, articlesProcessed } =
      await generateLocaleSummariesForIngest(loadCache, forLlm, targetLocales);
    const upsert = await this.upsertCacheRows(cacheRows);

    return {
      activeLocales: targetLocales,
      candidates: sorted.length,
      queued: forLlm.length,
      processed: articlesProcessed,
      cacheRows: upsert.upserted,
    };
  }

  /** 定时批量补全缺失的多语言摘要（原 ingest-article-summaries Edge Function）。 */
  async runBatchSummarize(): Promise<BatchSummarizeResult> {
    const lockTtlSeconds = Math.max(
      60,
      parseInt(env('SUMMARIZE_JOB_LOCK_TTL_SECONDS', '900'), 10),
    );
    const lock = await this.tryAcquireJobLock(JOB_NAME, lockTtlSeconds);
    if (!lock.acquired) {
      return {
        ok: true,
        skipped: true,
        reason: 'already_running',
        activeLocales: [],
        articlesScanned: 0,
        missingFound: 0,
        llmQueued: 0,
        llmProcessed: 0,
        localeCacheRows: 0,
        cacheUpsertError: null,
      };
    }

    const workerId = lock.workerId;
    try {
      const lookbackDays = Math.max(
        1,
        parseInt(env('SUMMARIZE_LOOKBACK_DAYS', '14'), 10),
      );
      const scanLimit = Math.max(
        1,
        parseInt(env('SUMMARIZE_SCAN_LIMIT', '120'), 10),
      );
      const maxPerRun = Math.max(
        1,
        parseInt(env('SUMMARIZE_ITEMS_PER_RUN', '40'), 10),
      );
      const deepseekConfigured = Boolean(env('DEEPSEEK_API_KEY').trim());

      const targetLocales = await this.resolveTargetLocales();
      const { articles: missing, scanned } =
        await this.loadArticlesMissingLocaleCache({
          lookbackDays,
          scanLimit,
          targetLocales,
        });

      const forLlm: ArticleLlmInput[] = [];
      for (const row of missing) {
        const inp = toLlmInput(
          row.source_url,
          row.title,
          row.raw_summary ?? '',
          row.canonical_url,
        );
        if (inp) {
          forLlm.push(inp);
        }
      }

      const toProcess = forLlm.slice(0, maxPerRun);
      let llmProcessed = 0;
      let localeCacheRows = 0;
      let cacheUpsertError: string | null = null;

      if (toProcess.length > 0 && deepseekConfigured) {
        const loadCache = (c: string[], locs: ArticleLocaleKey[]) =>
          this.loadCacheContentByCanon(c, locs);
        const { cacheRows, articlesProcessed, stats } =
          await generateLocaleSummariesForIngest(
            loadCache,
            toProcess,
            targetLocales,
          );
        const upsertResult = await this.upsertCacheRows(cacheRows);
        cacheUpsertError = upsertResult.error;
        llmProcessed = articlesProcessed;
        localeCacheRows = upsertResult.upserted;

        if (llmProcessed < toProcess.length) {
          this.logger.warn(
            `batch summarize LLM missed ${toProcess.length - llmProcessed}/${toProcess.length} stats=${JSON.stringify(stats)}`,
          );
        }
      } else if (toProcess.length > 0 && !deepseekConfigured) {
        this.logger.warn('batch summarize skipped: DEEPSEEK_API_KEY missing');
      }

      this.logger.log(
        `batch summarize scanned=${scanned} missing=${missing.length} processed=${llmProcessed} cacheRows=${localeCacheRows}`,
      );

      return {
        ok: true,
        activeLocales: targetLocales,
        articlesScanned: scanned,
        missingFound: missing.length,
        llmQueued: toProcess.length,
        llmProcessed,
        localeCacheRows,
        cacheUpsertError,
      };
    } catch (e) {
      this.logger.error(`batch summarize failed: ${String(e)}`);
      throw e;
    } finally {
      await this.releaseJobLock(JOB_NAME, workerId);
    }
  }

  private addLocale(set: Set<ArticleLocaleKey>, raw: unknown) {
    if (typeof raw !== 'string') {
      return;
    }
    const t = raw.trim();
    if (!t) {
      return;
    }
    set.add(normalizeArticleLocale(t));
  }

  private isMissingAnyLocale(
    canon: string,
    targetLocales: ArticleLocaleKey[],
    cachedByCanon: Map<string, Set<string>>,
  ): boolean {
    const cached = cachedByCanon.get(canon);
    for (const loc of targetLocales) {
      if (!cached?.has(loc)) {
        return true;
      }
    }
    return false;
  }

  private isMissingAnyLocaleInContent(
    canon: string,
    targetLocales: ArticleLocaleKey[],
    cached: CacheContentByCanon,
  ): boolean {
    const byLoc = cached.get(canon);
    for (const loc of targetLocales) {
      if (!byLoc?.has(loc)) {
        return true;
      }
    }
    return false;
  }

  private async tryAcquireJobLock(
    jobName: string,
    ttlSeconds: number,
  ): Promise<JobLockResult> {
    const workerId = randomUUID();
    const now = new Date();
    const lockedUntil = new Date(
      now.getTime() + Math.max(60, ttlSeconds) * 1000,
    );

    await this.prisma.ainewsEdgeJobLock.deleteMany({
      where: { jobName, lockedUntil: { lt: now } },
    });

    try {
      await this.prisma.ainewsEdgeJobLock.create({
        data: { jobName, lockedUntil, workerId },
      });
      return {
        acquired: true,
        workerId,
        lockedUntil: lockedUntil.toISOString(),
      };
    } catch {
      const existing = await this.prisma.ainewsEdgeJobLock.findUnique({
        where: { jobName },
        select: { lockedUntil: true },
      });
      return {
        acquired: false,
        lockedUntil: existing?.lockedUntil?.toISOString() ?? null,
      };
    }
  }

  private async releaseJobLock(
    jobName: string,
    workerId: string,
  ): Promise<void> {
    if (!workerId) {
      return;
    }
    await this.prisma.ainewsEdgeJobLock.deleteMany({
      where: { jobName, workerId },
    });
  }
}
