import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1"

import { isPresetDomainId } from "./rss-config"

export type DigestArticle = {
  canonicalUrl: string
  sourceUrl: string
  title: string
  summary: string
  source: string
  publishedAt: string
  domains: string[]
  matchedDomain: string
}

type ArticleRow = {
  canonical_url: string
  source_url: string
  title: string
  published_at: string
  source: string
  domains: string[]
  raw_summary: string | null
}

type CacheRow = {
  url: string
  locale: string
  title: string
  summary: string
}

function matchCustomDomain(
  custom: string,
  title: string,
  summary: string
): boolean {
  const q = custom.trim().toLowerCase()
  if (!q) {
    return false
  }
  return `${title}\n${summary}`.toLowerCase().includes(q)
}

function pickSummaryFromCache(
  rows: CacheRow[],
  canon: string,
  locale: string
): { title: string; summary: string } | undefined {
  const priority =
    locale === "zh"
      ? ["zh", "en"]
      : locale === "en"
        ? ["en", "zh"]
        : [locale, "en", "zh"]
  for (const loc of priority) {
    const hit = rows.find((r) => r.url === canon && r.locale === loc && r.summary?.trim())
    if (hit) {
      return {
        title: hit.title?.trim() || "",
        summary: hit.summary.trim()
      }
    }
  }
  return undefined
}

export async function collectDigestArticlesFromDb(
  admin: SupabaseClient,
  params: {
    domains: string[]
    sinceIso: string
    locale: string
    maxArticles?: number
  }
): Promise<DigestArticle[]> {
  const trimmed = [
    ...new Set(
      params.domains
        .filter((d) => typeof d === "string")
        .map((d) => d.trim())
        .filter(Boolean)
    )
  ]
  if (trimmed.length === 0) {
    return []
  }

  const presets = [
    ...new Set(
      trimmed.filter((d) => isPresetDomainId(d.toLowerCase())).map((d) => d.toLowerCase())
    )
  ]
  const customs = trimmed.filter((d) => !isPresetDomainId(d.toLowerCase()))

  const maxArticles = Math.max(1, params.maxArticles ?? 120)

  const { data: articleRows, error } = await admin
    .from("articles")
    .select(
      "canonical_url, source_url, title, published_at, source, domains, raw_summary"
    )
    .gte("published_at", params.sinceIso)
    .order("published_at", { ascending: false })
    .limit(800)

  if (error) {
    throw new Error(error.message)
  }

  const filtered: Array<ArticleRow & { matchedDomain: string }> = []
  for (const row of (articleRows ?? []) as ArticleRow[]) {
    const doms = row.domains ?? []
    const presetHit = presets.find((p) => doms.includes(p))
    const customHit = customs.find((c) =>
      matchCustomDomain(c, row.title, row.raw_summary ?? "")
    )
    if (presetHit) {
      filtered.push({ ...row, matchedDomain: presetHit })
    } else if (customHit) {
      filtered.push({ ...row, matchedDomain: customHit })
    }
  }

  const slice = filtered.slice(0, maxArticles)
  const canonUrls = slice.map((a) => a.canonical_url)

  const { data: cacheRows } = await admin
    .from("article_summary_cache")
    .select("url, locale, title, summary")
    .in("url", canonUrls.length > 0 ? canonUrls : ["__none__"])

  const cacheList = (cacheRows ?? []) as CacheRow[]

  return slice.map((a) => {
    const cached = pickSummaryFromCache(cacheList, a.canonical_url, params.locale)
    return {
      canonicalUrl: a.canonical_url,
      sourceUrl: a.source_url,
      title: cached?.title || a.title,
      summary: cached?.summary || a.raw_summary?.trim() || a.title,
      source: a.source,
      publishedAt: a.published_at,
      domains: a.domains ?? [],
      matchedDomain: a.matchedDomain
    }
  })
}

/** 按 matchedDomain 分组，便于 LLM 分领域汇总 */
export function groupArticlesByDomain(
  articles: DigestArticle[],
  followDomains: string[]
): Map<string, DigestArticle[]> {
  const order = new Map<string, number>()
  followDomains.forEach((d, i) => {
    order.set(d.toLowerCase(), i)
    order.set(d, i)
  })

  const groups = new Map<string, DigestArticle[]>()
  for (const a of articles) {
    const key = a.matchedDomain
    const list = groups.get(key) ?? []
    list.push(a)
    groups.set(key, list)
  }

  const sorted = [...groups.entries()].sort((a, b) => {
    const ia = order.get(a[0].toLowerCase()) ?? order.get(a[0]) ?? 999
    const ib = order.get(b[0].toLowerCase()) ?? order.get(b[0]) ?? 999
    return ia - ib
  })
  return new Map(sorted)
}
