import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1"

import type { ArticleLocaleKey } from "./article-locale"
import { canonicalUrlForSummaryCache } from "./url-cache-key"

export type ArticleRowForSummary = {
  canonical_url: string
  source_url: string
  title: string
  raw_summary: string | null
}

/** 避免 PostgREST `.in(url, …)` 过长导致整批缓存查询失败。 */
const CACHE_CHUNK = 30

async function loadCacheContentByCanon(
  admin: SupabaseClient,
  canons: string[],
  locales: ArticleLocaleKey[]
): Promise<Map<string, Map<string, { title: string; summary: string }>>> {
  const byCanon = new Map<string, Map<string, { title: string; summary: string }>>()
  if (canons.length === 0 || locales.length === 0) {
    return byCanon
  }

  for (let i = 0; i < canons.length; i += CACHE_CHUNK) {
    const chunk = canons.slice(i, i + CACHE_CHUNK)
    const { data: hits, error } = await admin
      .from("article_summary_cache")
      .select("url, locale, title, summary")
      .in("url", chunk)
      .in("locale", locales)
    if (error) {
      console.warn(
        "[articles-missing-cache] load cache chunk failed",
        error.message,
        `chunkSize=${chunk.length}`
      )
      continue
    }
    for (const row of (hits ?? []) as Array<{
      url: string
      locale: string
      title: string | null
      summary: string | null
    }>) {
      if (!row.url || !row.summary?.trim()) {
        continue
      }
      const key = canonicalUrlForSummaryCache(row.url) || row.url
      let byLoc = byCanon.get(key)
      if (!byLoc) {
        byLoc = new Map()
        byCanon.set(key, byLoc)
      }
      byLoc.set(row.locale, {
        title: (row.title ?? "").trim(),
        summary: row.summary.trim()
      })
    }
  }
  return byCanon
}

async function loadCacheLocalesByCanon(
  admin: SupabaseClient,
  canons: string[],
  locales: ArticleLocaleKey[]
): Promise<Map<string, Set<string>>> {
  const content = await loadCacheContentByCanon(admin, canons, locales)
  const byCanon = new Map<string, Set<string>>()
  for (const [canon, byLoc] of content) {
    byCanon.set(canon, new Set(byLoc.keys()))
  }
  return byCanon
}

function isMissingAnyLocale(
  canon: string,
  targetLocales: ArticleLocaleKey[],
  cachedByCanon: Map<string, Set<string>>
): boolean {
  const cached = cachedByCanon.get(canon)
  for (const loc of targetLocales) {
    if (!cached?.has(loc)) {
      return true
    }
  }
  return false
}

const SCAN_PAGE_SIZE = 200
/** 单次任务最多翻页扫描的文章总数，防止无限循环。 */
const MAX_ARTICLES_SCANNED = 5000

export type MissingLocaleCacheResult = {
  articles: ArticleRowForSummary[]
  /** 本次在 lookback 窗口内实际扫描过的文章行数 */
  scanned: number
}

/**
 * 近 N 天内已入库、但在 targetLocales 中至少缺一种语言摘要的文章。
 * 按 published_at 从新到旧分页扫描，直到凑满 scanLimit 条缺失或扫完窗口。
 * （旧逻辑只取最新 scanLimit 行：若这 N 条都已有摘要，更早的缺摘要文章永远不会被处理。）
 */
export async function loadArticlesMissingLocaleCache(
  admin: SupabaseClient,
  opts: {
    lookbackDays: number
    scanLimit: number
    targetLocales: ArticleLocaleKey[]
  }
): Promise<MissingLocaleCacheResult> {
  const targetLocales = [...new Set(opts.targetLocales)]
  if (targetLocales.length === 0) {
    return { articles: [], scanned: 0 }
  }

  const lookbackDays = Math.max(1, opts.lookbackDays)
  const scanLimit = Math.max(1, opts.scanLimit)
  const sinceIso = new Date(
    Date.now() - lookbackDays * 86_400_000
  ).toISOString()

  const missing: ArticleRowForSummary[] = []
  let scanned = 0
  let offset = 0

  while (missing.length < scanLimit && scanned < MAX_ARTICLES_SCANNED) {
    const { data: pageRows, error } = await admin
      .from("articles")
      .select("canonical_url, source_url, title, raw_summary")
      // 旧 RSS 条目可能 published_at 很早但 created_at 近期才入库
      .or(`published_at.gte.${sinceIso},created_at.gte.${sinceIso}`)
      .order("published_at", { ascending: false })
      .range(offset, offset + SCAN_PAGE_SIZE - 1)

    if (error) {
      console.warn("[articles-missing-cache] load articles", error.message)
      break
    }
    if (!pageRows?.length) {
      break
    }

    scanned += pageRows.length
    const rows = pageRows as ArticleRowForSummary[]
    const canons = rows
      .map((r) => canonicalUrlForSummaryCache(r.canonical_url) || r.canonical_url)
      .filter(Boolean)
    const cachedByCanon = await loadCacheLocalesByCanon(
      admin,
      canons,
      targetLocales
    )

    for (const r of rows) {
      if (missing.length >= scanLimit) {
        break
      }
      if (
        r.canonical_url &&
        isMissingAnyLocale(
          canonicalUrlForSummaryCache(r.canonical_url) || r.canonical_url,
          targetLocales,
          cachedByCanon
        )
      ) {
        missing.push(r)
      }
    }

    if (pageRows.length < SCAN_PAGE_SIZE) {
      break
    }
    offset += SCAN_PAGE_SIZE
  }

  return { articles: missing, scanned }
}

export { loadCacheContentByCanon }
