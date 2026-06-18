import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { env } from './lib/env';

export type CleanupResult = {
  ok: true;
  retentionDays: number;
  cutoffIso: string;
  articlesDeleted: number;
  cacheDeleted: number;
};

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

@Injectable()
export class AinewsCleanupService {
  private readonly logger = new Logger(AinewsCleanupService.name);

  constructor(private readonly prisma: PrismaService) {}

  async runCleanup(): Promise<CleanupResult> {
    const retentionDays = Math.max(
      1,
      parseInt(env('NEWS_RETENTION_DAYS', '10'), 10),
    );
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const cutoffIso = cutoff.toISOString();

    const stale = await this.prisma.ainewsArticle.findMany({
      where: { publishedAt: { lt: cutoff } },
      select: { canonicalUrl: true },
    });
    const canonUrls = stale.map((r) => r.canonicalUrl);

    if (canonUrls.length > 0) {
      await this.prisma.ainewsArticle.deleteMany({
        where: { publishedAt: { lt: cutoff } },
      });
    }

    let cacheDeleted = 0;
    for (const group of chunk(canonUrls, 500)) {
      const res = await this.prisma.ainewsArticleSummaryCache.deleteMany({
        where: { url: { in: group } },
      });
      cacheDeleted += res.count;
    }

    this.logger.log(
      `cleanup retention=${retentionDays}d articles=${canonUrls.length} cache=${cacheDeleted}`,
    );

    return {
      ok: true,
      retentionDays,
      cutoffIso,
      articlesDeleted: canonUrls.length,
      cacheDeleted,
    };
  }
}
