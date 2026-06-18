import { PrismaService } from '../../prisma/prisma.service';
import { isPresetDomainId } from './rss-config';

export type DigestArticle = {
  canonicalUrl: string;
  sourceUrl: string;
  title: string;
  summary: string;
  source: string;
  publishedAt: string;
  domains: string[];
  matchedDomain: string;
};

function matchCustomDomain(
  custom: string,
  title: string,
  summary: string,
): boolean {
  const q = custom.trim().toLowerCase();
  if (!q) return false;
  return `${title}\n${summary}`.toLowerCase().includes(q);
}

function pickSummaryFromCache(
  rows: Array<{ url: string; locale: string; title: string; summary: string }>,
  canon: string,
  locale: string,
): { title: string; summary: string } | undefined {
  const priority =
    locale === 'zh'
      ? ['zh', 'en']
      : locale === 'en'
        ? ['en', 'zh']
        : [locale, 'en', 'zh'];
  for (const loc of priority) {
    const hit = rows.find(
      (r) => r.url === canon && r.locale === loc && r.summary?.trim(),
    );
    if (hit) {
      return {
        title: hit.title?.trim() || '',
        summary: hit.summary.trim(),
      };
    }
  }
  return undefined;
}

export async function collectDigestArticlesFromDb(
  prisma: PrismaService,
  params: {
    domains: string[];
    sinceIso: string;
    locale: string;
    maxArticles?: number;
  },
): Promise<DigestArticle[]> {
  const trimmed = [
    ...new Set(
      params.domains
        .filter((d) => typeof d === 'string')
        .map((d) => d.trim())
        .filter(Boolean),
    ),
  ];
  if (trimmed.length === 0) return [];

  const presets = [
    ...new Set(
      trimmed
        .filter((d) => isPresetDomainId(d.toLowerCase()))
        .map((d) => d.toLowerCase()),
    ),
  ];
  const customs = trimmed.filter((d) => !isPresetDomainId(d.toLowerCase()));
  const maxArticles = Math.max(1, params.maxArticles ?? 120);
  const since = new Date(params.sinceIso);

  const articleRows = await prisma.ainewsArticle.findMany({
    where: { publishedAt: { gte: since } },
    orderBy: { publishedAt: 'desc' },
    take: 800,
    select: {
      canonicalUrl: true,
      sourceUrl: true,
      title: true,
      publishedAt: true,
      source: true,
      domains: true,
      rawSummary: true,
    },
  });

  const filtered: Array<(typeof articleRows)[0] & { matchedDomain: string }> =
    [];
  for (const row of articleRows) {
    const doms = row.domains ?? [];
    const presetHit = presets.find((p) => doms.includes(p));
    const customHit = customs.find((c) =>
      matchCustomDomain(c, row.title, row.rawSummary ?? ''),
    );
    if (presetHit) {
      filtered.push({ ...row, matchedDomain: presetHit });
    } else if (customHit) {
      filtered.push({ ...row, matchedDomain: customHit });
    }
  }

  const slice = filtered.slice(0, maxArticles);
  const canonUrls = slice.map((a) => a.canonicalUrl);

  const cacheRows =
    canonUrls.length > 0
      ? await prisma.ainewsArticleSummaryCache.findMany({
          where: { url: { in: canonUrls } },
          select: { url: true, locale: true, title: true, summary: true },
        })
      : [];

  return slice.map((a) => {
    const cached = pickSummaryFromCache(cacheRows, a.canonicalUrl, params.locale);
    return {
      canonicalUrl: a.canonicalUrl,
      sourceUrl: a.sourceUrl,
      title: cached?.title || a.title,
      summary: cached?.summary || a.rawSummary?.trim() || a.title,
      source: a.source,
      publishedAt: a.publishedAt.toISOString(),
      domains: a.domains ?? [],
      matchedDomain: a.matchedDomain,
    };
  });
}

export function groupArticlesByDomain(
  articles: DigestArticle[],
  followDomains: string[],
): Map<string, DigestArticle[]> {
  const order = new Map<string, number>();
  followDomains.forEach((d, i) => {
    order.set(d.toLowerCase(), i);
    order.set(d, i);
  });

  const groups = new Map<string, DigestArticle[]>();
  for (const a of articles) {
    const list = groups.get(a.matchedDomain) ?? [];
    list.push(a);
    groups.set(a.matchedDomain, list);
  }

  const sorted = [...groups.entries()].sort((a, b) => {
    const ia = order.get(a[0].toLowerCase()) ?? order.get(a[0]) ?? 999;
    const ib = order.get(b[0].toLowerCase()) ?? order.get(b[0]) ?? 999;
    return ia - ib;
  });
  return new Map(sorted);
}
