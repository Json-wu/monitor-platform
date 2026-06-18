import { extractBestImageFromHtml } from "./article-image-extract"
import { env } from "./env"

export async function fetchArticleImageUrl(
  articleUrl: string,
  timeoutMs = 12_000
): Promise<string | undefined> {
  const ctrl = new AbortController()
  const id = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const r = await fetch(articleUrl, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "User-Agent":
          env("RSS_FETCH_USER_AGENT", "IndustryAINews/1.0 (+article-image)")
      }
    })
    if (!r.ok) {
      return undefined
    }
    const ct = (r.headers.get("content-type") ?? "").toLowerCase()
    if (ct && !ct.includes("text/html") && !ct.includes("application/xhtml")) {
      return undefined
    }
    const html = await r.text()
    return extractBestImageFromHtml(html)
  } catch {
    return undefined
  } finally {
    clearTimeout(id)
  }
}

export async function enrichRowsWithArticleImages<
  T extends { url: string; imageUrl?: string }
>(rows: T[], opts?: { max?: number; concurrency?: number }): Promise<number> {
  const max = Math.max(0, opts?.max ?? 40)
  const concurrency = Math.max(1, Math.min(8, opts?.concurrency ?? 5))
  const pending = rows.filter((r) => !r.imageUrl).slice(0, max)
  if (pending.length === 0) {
    return 0
  }

  let fetched = 0
  let idx = 0

  async function worker() {
    while (idx < pending.length) {
      const i = idx++
      const row = pending[i]
      const img = await fetchArticleImageUrl(row.url)
      if (img) {
        row.imageUrl = img
        fetched++
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, pending.length) }, () => worker())
  )
  return fetched
}
