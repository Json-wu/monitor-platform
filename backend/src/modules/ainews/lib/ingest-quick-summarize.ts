import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1"

import {
  generateLocaleSummariesForIngest,
  toLlmInput,
  upsertArticleLocaleCache,
  type ArticleLlmInput
} from "./article-llm"
import type { ArticleLocaleKey } from "./article-locale"
import { loadActiveUserLocales } from "./active-user-locales"
import { loadCacheContentByCanon } from "./articles-missing-cache"

export type IngestArticleForSummarize = {
  canon: string
  sourceUrl: string
  title: string
  rawSummary: string
  publishedAt: string
  /** 本轮 ingest 新入库（非 upsert 更新） */
  isNew: boolean
}

export type QuickSummarizeResult = {
  activeLocales: ArticleLocaleKey[]
  candidates: number
  queued: number
  processed: number
  cacheRows: number
  skippedReason?: string
}

function isMissingAnyLocale(
  canon: string,
  targetLocales: ArticleLocaleKey[],
  cached: Map<string, Map<string, { title: string; summary: string }>>
): boolean {
  const byLoc = cached.get(canon)
  for (const loc of targetLocales) {
    if (!byLoc?.has(loc)) {
      return true
    }
  }
  return false
}

/**
 * RSS 入库后即时摘要：优先本轮新文章，再按发布时间；仅补用户活跃语言缺缓存的条目。
 * 余量由 ingest-article-summaries 定时任务继续处理。
 */
export async function quickSummarizeAfterIngest(
  admin: SupabaseClient,
  articles: IngestArticleForSummarize[]
): Promise<QuickSummarizeResult> {
  const empty: QuickSummarizeResult = {
    activeLocales: [],
    candidates: articles.length,
    queued: 0,
    processed: 0,
    cacheRows: 0
  }

  const limit = Math.max(
    0,
    parseInt(Deno.env.get("INGEST_QUICK_SUMMARIZE_LIMIT") ?? "8", 10)
  )
  if (limit === 0) {
    return { ...empty, skippedReason: "disabled" }
  }

  const deepseekConfigured = Boolean(
    (Deno.env.get("DEEPSEEK_API_KEY") ?? "").trim()
  )
  if (!deepseekConfigured) {
    return { ...empty, skippedReason: "no_deepseek" }
  }

  if (articles.length === 0) {
    return { ...empty, skippedReason: "empty_batch" }
  }

  const activeLocales = await loadActiveUserLocales(admin)
  if (activeLocales.length === 0) {
    return { ...empty, skippedReason: "no_active_locales" }
  }

  const sorted = [...articles].sort((a, b) => {
    if (a.isNew !== b.isNew) {
      return a.isNew ? -1 : 1
    }
    return (
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    )
  })

  const canons = sorted.map((a) => a.canon)
  const cached = await loadCacheContentByCanon(admin, canons, activeLocales)

  const forLlm: ArticleLlmInput[] = []
  for (const a of sorted) {
    if (forLlm.length >= limit) {
      break
    }
    if (!isMissingAnyLocale(a.canon, activeLocales, cached)) {
      continue
    }
    const inp = toLlmInput(a.sourceUrl, a.title, a.rawSummary, a.canon)
    if (inp) {
      forLlm.push(inp)
    }
  }

  if (forLlm.length === 0) {
    return {
      activeLocales,
      candidates: sorted.length,
      queued: 0,
      processed: 0,
      cacheRows: 0,
      skippedReason: "all_cached"
    }
  }

  const { cacheRows, articlesProcessed } =
    await generateLocaleSummariesForIngest(admin, forLlm, activeLocales)
  const upsert = await upsertArticleLocaleCache(admin, cacheRows)

  return {
    activeLocales,
    candidates: sorted.length,
    queued: forLlm.length,
    processed: articlesProcessed,
    cacheRows: upsert.upserted
  }
}
