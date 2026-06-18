import {
  type ArticleLocaleKey,
  ARTICLE_LOCALE_KEYS,
  normalizeArticleLocale,
  localeDisplayName
} from "./article-locale"
import { canonicalUrlForSummaryCache } from "./url-cache-key"
import { env } from "./env"

export type CacheContentByCanon = Map<
  string,
  Map<string, { title: string; summary: string }>
>

export type LoadCacheContentFn = (
  canons: string[],
  locales: ArticleLocaleKey[]
) => Promise<CacheContentByCanon>

export type ArticleLlmInput = {
  url: string
  title: string
  hint: string
  canon: string
}

const DEFAULT_DEEPSEEK_BASE = "https://api.deepseek.com"

function extractChatCompletionText(data: unknown): string {
  const root = data as {
    choices?: Array<{ message?: { content?: string | null } }>
  }
  const text = root.choices?.[0]?.message?.content
  return typeof text === "string" ? text : ""
}

function extractJsonArrayText(text: string): string {
  let t = text.trim()
  const fence = /```(?:json)?\s*([\s\S]*?)```/im.exec(t)
  if (fence) {
    t = fence[1].trim()
  }
  if (t.startsWith("[")) {
    return t
  }
  const arrayMatch = /\[[\s\S]*\]/.exec(t)
  if (arrayMatch) {
    return arrayMatch[0]
  }
  if (t.startsWith("{")) {
    return t
  }
  return t
}

function parseTitleSummaryJson(
  text: string
): Array<{ url: string; title: string; summary: string }> {
  const t = extractJsonArrayText(text)
  let parsed: unknown
  try {
    parsed = JSON.parse(t)
  } catch {
    console.warn("[article-llm] invalid JSON from model", text.slice(0, 300))
    return []
  }
  const rows: unknown[] = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object"
      ? (((parsed as Record<string, unknown>).items ??
          (parsed as Record<string, unknown>).results ??
          (parsed as Record<string, unknown>).data) as unknown[] | undefined) ??
        [parsed]
      : []
  const out: Array<{ url: string; title: string; summary: string }> = []
  for (const row of rows) {
    if (!row || typeof row !== "object") {
      continue
    }
    const o = row as Record<string, unknown>
    const url = typeof o.url === "string" ? o.url.trim() : ""
    const title = typeof o.title === "string" ? o.title.trim() : ""
    const summary = typeof o.summary === "string" ? o.summary.trim() : ""
    if (title && summary) {
      out.push({ url, title, summary })
    }
  }
  return out
}

/** 将模型输出对齐到输入文章；优先 canonical url，其次顺序位置（模型常改写出 url）。 */
function alignParsedSummariesToInputs(
  items: ArticleLlmInput[],
  parsed: Array<{ url: string; title: string; summary: string }>
): Map<string, { title: string; summary: string }> {
  const out = new Map<string, { title: string; summary: string }>()
  const byKey = new Map<string, { title: string; summary: string }>()
  for (const row of parsed) {
    const key = canonicalUrlForSummaryCache(row.url) || row.url.trim()
    if (key && row.title && row.summary) {
      byKey.set(key, { title: row.title, summary: row.summary })
    }
  }
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    let hit =
      byKey.get(item.canon) ??
      byKey.get(canonicalUrlForSummaryCache(item.url)) ??
      byKey.get(item.url)
    if (!hit && i < parsed.length) {
      const row = parsed[i]
      if (row.title && row.summary) {
        hit = { title: row.title, summary: row.summary }
      }
    }
    if (hit) {
      out.set(item.canon, hit)
    }
  }
  if (parsed.length > 0 && out.size < items.length) {
    console.warn(
      "[article-llm] partial LLM match",
      `${out.size}/${items.length} items aligned (${parsed.length} parsed rows)`
    )
  }
  return out
}

async function callDeepSeek(
  systemContent: string,
  userContent: string,
  maxTokens = 4096
): Promise<string> {
  const deepseekKey = env("DEEPSEEK_API_KEY")
  if (!deepseekKey) {
    throw new Error("DEEPSEEK_API_KEY not set")
  }
  const model = env("DEEPSEEK_MODEL", "deepseek-chat")
  const apiBase = env("DEEPSEEK_API_BASE", DEFAULT_DEEPSEEK_BASE).replace(/\/$/, "")
  const chatUrl = `${apiBase}/chat/completions`
  const llmRes = await fetch(chatUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${deepseekKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemContent },
        { role: "user", content: userContent }
      ],
      temperature: 0.35,
      max_tokens: maxTokens
    })
  })
  if (!llmRes.ok) {
    const errText = await llmRes.text()
    throw new Error(`DeepSeek HTTP ${llmRes.status}: ${errText.slice(0, 200)}`)
  }
  const llmJson: unknown = await llmRes.json()
  const rawText = extractChatCompletionText(llmJson)
  if (!rawText) {
    throw new Error("empty model output")
  }
  return rawText
}

function buildGeneratePrompt(
  locale: "zh" | "en",
  payload: string
): { system: string; user: string } {
  if (locale === "zh") {
    return {
      system:
        "你只输出合法 JSON 数组，元素为对象含 url、title、summary 字符串，无其它文字。",
      user:
        `你是中文新闻编辑。根据下列 JSON（url、title、hint），为每条写简洁中文标题（不超过 40 字）与一句摘要（不超过 80 字），客观、信息密度高。\n` +
        `只输出 JSON 数组：[{"url":"与输入一致","title":"...","summary":"..."}]，顺序与输入一致。\n\n输入：\n${payload}`
    }
  }
  return {
    system:
      "Output only a valid JSON array of objects with url, title, summary string fields.",
    user:
      `You are a concise news editor. For each item (url, title, hint), write a short English headline (max ~80 chars) and one-line summary (max ~120 chars).\n` +
      `Output only JSON array: [{"url":"exact from input","title":"...","summary":"..."}], same order.\n\nInput:\n${payload}`
  }
}

function buildTranslatePrompt(
  target: ArticleLocaleKey,
  sourceLocale: "zh" | "en",
  payload: string
): { system: string; user: string } {
  const langName = localeDisplayName(target)
  const fromName = sourceLocale === "zh" ? "Chinese" : "English"
  return {
    system:
      "Output only a valid JSON array of objects with url, title, summary string fields.",
    user:
      `Translate each news item's title and summary from ${fromName} to ${langName}. ` +
      `Keep url unchanged. Tone: objective news.\n` +
      `Output JSON array: [{"url":"...","title":"...","summary":"..."}]\n\nInput:\n${payload}`
  }
}

export async function generateTitleSummariesForLocale(
  items: ArticleLlmInput[],
  locale: "zh" | "en"
): Promise<Map<string, { title: string; summary: string }>> {
  if (items.length === 0) {
    return new Map()
  }
  const payload = JSON.stringify(
    items.map((c) => ({ url: c.canon, title: c.title, hint: c.hint })),
    null,
    0
  )
  const { system, user } = buildGeneratePrompt(locale, payload)
  const maxTokens = Math.min(8192, Math.max(4096, items.length * 400))
  const rawText = await callDeepSeek(system, user, maxTokens)
  const parsed = parseTitleSummaryJson(rawText)
  const aligned = alignParsedSummariesToInputs(items, parsed)
  if (aligned.size === 0 && items.length > 0) {
    console.warn(
      "[article-llm] zero alignments",
      locale,
      `items=${items.length}`,
      `parsed=${parsed.length}`,
      rawText.slice(0, 300)
    )
  }
  return aligned
}

async function generateTitleSummariesWithFallback(
  items: ArticleLlmInput[],
  locale: "zh" | "en"
): Promise<Map<string, { title: string; summary: string }>> {
  if (items.length === 0) {
    return new Map()
  }
  if (items.length === 1) {
    return generateTitleSummariesForLocale(items, locale)
  }
  const batch = await generateTitleSummariesForLocale(items, locale)
  if (batch.size > 0) {
    return batch
  }
  const merged = new Map<string, { title: string; summary: string }>()
  for (const item of items) {
    try {
      const one = await generateTitleSummariesForLocale([item], locale)
      for (const [k, v] of one) {
        merged.set(k, v)
      }
    } catch (e) {
      console.warn("[article-llm] single-item fallback failed", item.canon, e)
    }
  }
  return merged
}

export async function translateTitleSummaries(
  items: Array<{ url: string; title: string; summary: string }>,
  sourceLocale: "zh" | "en",
  targetLocale: ArticleLocaleKey
): Promise<Map<string, { title: string; summary: string }>> {
  if (items.length === 0 || targetLocale === sourceLocale) {
    return new Map()
  }
  const payload = JSON.stringify(items, null, 0)
  const { system, user } = buildTranslatePrompt(targetLocale, sourceLocale, payload)
  const maxTokens = Math.min(8192, Math.max(4096, items.length * 400))
  const rawText = await callDeepSeek(system, user, maxTokens)
  const parsed = parseTitleSummaryJson(rawText)
  const inputItems: ArticleLlmInput[] = items.map((s) => ({
    url: s.url,
    canon: canonicalUrlForSummaryCache(s.url) || s.url.trim(),
    title: s.title,
    hint: s.summary
  }))
  return alignParsedSummariesToInputs(inputItems, parsed)
}

export function toLlmInput(
  url: string,
  title: string,
  hint: string,
  canonOverride?: string
): ArticleLlmInput | null {
  const canon = (canonOverride ?? canonicalUrlForSummaryCache(url)).trim()
  if (!canon || !title.trim()) {
    return null
  }
  return {
    url: url.trim() || canon,
    title: title.slice(0, 400),
    hint: hint.slice(0, 500),
    canon
  }
}

export function pickSourceLocaleForTranslate(
  target: ArticleLocaleKey
): "zh" | "en" {
  return target === "zh" ? "zh" : "en"
}

export type ArticleLocaleCacheRow = {
  canon: string
  locale: string
  title: string
  summary: string
}

function chunkArray<T>(items: T[], size: number): T[][] {
  if (items.length === 0) {
    return []
  }
  const n = Math.max(1, size)
  const out: T[][] = []
  for (let i = 0; i < items.length; i += n) {
    out.push(items.slice(i, i + n))
  }
  return out
}

function pickPivotSource(
  c: ArticleLlmInput,
  pivotEn: Map<string, { title: string; summary: string }>,
  pivotZh: Map<string, { title: string; summary: string }>,
  cached: Map<string, { title: string; summary: string }> | undefined
): { locale: "zh" | "en"; item: { url: string; title: string; summary: string } } | null {
  const fromEn = pivotEn.get(c.canon) ?? cached?.get("en")
  if (fromEn?.summary) {
    return {
      locale: "en",
      item: { url: c.canon, title: fromEn.title, summary: fromEn.summary }
    }
  }
  const fromZh = pivotZh.get(c.canon) ?? cached?.get("zh")
  if (fromZh?.summary) {
    return {
      locale: "zh",
      item: { url: c.canon, title: fromZh.title, summary: fromZh.summary }
    }
  }
  return null
}

export type IngestLlmStats = {
  zhRequested: number
  enRequested: number
  llmCalls: number
  llmErrors: string[]
}

/**
 * 按用户活跃语言为文章生成/翻译标题与摘要；仅写入 targetLocales。
 * 次要语言缺英文/中文源时，会临时生成 pivot（不落库非目标语言）。
 * items 应已预先筛为缺摘要；不再因 DB 二次读缓存跳过 zh/en（避免误跳过）。
 */
export async function generateLocaleSummariesForIngest(
  loadCacheContent: LoadCacheContentFn,
  items: ArticleLlmInput[],
  targetLocales: ArticleLocaleKey[]
): Promise<{
  cacheRows: ArticleLocaleCacheRow[]
  articlesProcessed: number
  stats: IngestLlmStats
}> {
  const targets = [...new Set(targetLocales)]
  const cacheRows: ArticleLocaleCacheRow[] = []
  const stats: IngestLlmStats = {
    zhRequested: 0,
    enRequested: 0,
    llmCalls: 0,
    llmErrors: []
  }
  if (items.length === 0 || targets.length === 0) {
    return { cacheRows, articlesProcessed: 0, stats }
  }

  const targetSet = new Set(targets)
  const secondaryTargets = targets.filter((l) => l !== "zh" && l !== "en")
  const batchSize = Math.max(
    1,
    parseInt(
      env("SUMMARIZE_LLM_BATCH_SIZE", env("INGEST_LLM_BATCH_SIZE", "5")),
      10
    )
  )
  const touchedCanons = new Set<string>()

  for (const batch of chunkArray(items, batchSize)) {
    const canons = batch.map((b) => b.canon)
    const cachedContent = await loadCacheContent(canons, [
      ...ARTICLE_LOCALE_KEYS
    ])

    const zhBatch = batch.filter(
      (c) => targetSet.has("zh") && !touchedCanons.has(c.canon)
    )
    const enBatch = batch.filter(
      (c) => targetSet.has("en") && !touchedCanons.has(c.canon)
    )
    stats.zhRequested += zhBatch.length
    stats.enRequested += enBatch.length

    let zhMap = new Map<string, { title: string; summary: string }>()
    let enMap = new Map<string, { title: string; summary: string }>()

    if (zhBatch.length > 0) {
      stats.llmCalls += 1
      try {
        zhMap = await generateTitleSummariesWithFallback(zhBatch, "zh")
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        stats.llmErrors.push(`zh: ${msg}`)
        console.warn("[article-llm] zh batch failed", msg)
      }
    }
    if (enBatch.length > 0) {
      stats.llmCalls += 1
      try {
        enMap = await generateTitleSummariesWithFallback(enBatch, "en")
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        stats.llmErrors.push(`en: ${msg}`)
        console.warn("[article-llm] en batch failed", msg)
      }
    }

    const pivotEn = new Map(enMap)
    const pivotZh = new Map(zhMap)

    for (const c of batch) {
      const zh = zhMap.get(c.canon)
      if (zh && targetSet.has("zh")) {
        cacheRows.push({
          canon: c.canon,
          locale: "zh",
          title: zh.title,
          summary: zh.summary
        })
        touchedCanons.add(c.canon)
      }
      const en = enMap.get(c.canon)
      if (en && targetSet.has("en")) {
        cacheRows.push({
          canon: c.canon,
          locale: "en",
          title: en.title,
          summary: en.summary
        })
        touchedCanons.add(c.canon)
      }
    }

    for (const loc of secondaryTargets) {
      const need = batch.filter((c) => !cachedContent.get(c.canon)?.has(loc))
      if (need.length === 0) {
        continue
      }

      const withoutPivot: ArticleLlmInput[] = []
      const sourceItems: Array<{ url: string; title: string; summary: string }> = []
      let sourceLocale: "zh" | "en" = "en"

      for (const c of need) {
        const picked = pickPivotSource(
          c,
          pivotEn,
          pivotZh,
          cachedContent.get(c.canon)
        )
        if (picked) {
          sourceItems.push(picked.item)
          sourceLocale = picked.locale
        } else {
          withoutPivot.push(c)
        }
      }

      if (withoutPivot.length > 0) {
        stats.llmCalls += 1
        const pivotOnly = await generateTitleSummariesWithFallback(
          withoutPivot,
          "en"
        )
        for (const c of withoutPivot) {
          const p = pivotOnly.get(c.canon)
          if (p) {
            pivotEn.set(c.canon, p)
            sourceItems.push({ url: c.canon, title: p.title, summary: p.summary })
            sourceLocale = "en"
          }
        }
      }

      if (sourceItems.length === 0) {
        continue
      }

      stats.llmCalls += 1
      const translated = await translateTitleSummaries(
        sourceItems,
        sourceLocale,
        loc
      )
      for (const c of need) {
        const hit = translated.get(c.canon)
        if (!hit) {
          continue
        }
        cacheRows.push({
          canon: c.canon,
          locale: loc,
          title: hit.title,
          summary: hit.summary
        })
        touchedCanons.add(c.canon)
      }
    }
  }

  return {
    cacheRows,
    articlesProcessed: touchedCanons.size,
    stats
  }
}

export { normalizeArticleLocale, type ArticleLocaleKey }
