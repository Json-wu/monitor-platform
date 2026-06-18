/** 与客户端 UiLang / 摘要缓存 locale 对齐 */
export type ArticleLocaleKey =
  | "zh"
  | "en"
  | "ja"
  | "ko"
  | "fr"
  | "de"
  | "es"
  | "pt"
  | "ru"
  | "hi"

const SUPPORTED: readonly ArticleLocaleKey[] = [
  "zh",
  "en",
  "ja",
  "ko",
  "fr",
  "de",
  "es",
  "pt",
  "ru",
  "hi"
]

export function normalizeArticleLocale(tag: string | undefined): ArticleLocaleKey {
  const t = (tag ?? "").trim().toLowerCase()
  const base = t.split("-")[0] || "en"
  if ((SUPPORTED as readonly string[]).includes(base)) {
    return base as ArticleLocaleKey
  }
  return "en"
}

export function localeDisplayName(locale: ArticleLocaleKey): string {
  const map: Record<ArticleLocaleKey, string> = {
    zh: "Simplified Chinese",
    en: "English",
    ja: "Japanese",
    ko: "Korean",
    fr: "French",
    de: "German",
    es: "Spanish",
    pt: "Portuguese",
    ru: "Russian",
    hi: "Hindi"
  }
  return map[locale] ?? "English"
}

export function isPrimaryLocale(locale: ArticleLocaleKey): boolean {
  return locale === "zh" || locale === "en"
}

/** ingest / list-news 使用的全部界面语言 */
export const ARTICLE_LOCALE_KEYS: readonly ArticleLocaleKey[] = SUPPORTED

/** RSS 入库后默认生成的摘要语言（标题 + 正文），与用户无关。 */
export const INGEST_BASE_LOCALES: readonly ArticleLocaleKey[] = ["zh", "en"]

/** 由英文摘要翻译的次要语言（ingest 批量生成） */
export const SECONDARY_ARTICLE_LOCALES: readonly ArticleLocaleKey[] =
  SUPPORTED.filter((l) => l !== "zh" && l !== "en")

/**
 * 入库 / 补全任务的目标语言：始终包含 zh、en；
 * 若存在使用其他界面语言的用户，再追加对应语言（去重）。
 */
export function resolveIngestTargetLocales(
  activeUserLocales: Iterable<ArticleLocaleKey>
): ArticleLocaleKey[] {
  const set = new Set<ArticleLocaleKey>(INGEST_BASE_LOCALES)
  for (const loc of activeUserLocales) {
    if (loc !== "zh" && loc !== "en") {
      set.add(loc)
    }
  }
  return [...set].sort()
}
