/** 摘要缓存与模型提示使用的语言桶（与 DB `article_summary_cache.locale` 一致）。 */
export type SummaryLocaleKey = "zh" | "en"

export function normalizeSummaryLocale(tag: string | undefined): SummaryLocaleKey {
  const t = (tag ?? "").trim().toLowerCase()
  return t.startsWith("zh") ? "zh" : "en"
}
