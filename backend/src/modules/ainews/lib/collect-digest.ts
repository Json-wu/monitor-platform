import {
  BROAD_FALLBACK_FEEDS,
  isPresetDomainId,
  MAX_DIGEST_ITEMS,
  MAX_ITEMS_PER_FEED,
  RSS_FEEDS
} from "./rss-config"
import { type DigestItem, parseFeedItems } from "./rss-parse"

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

async function fetchXml(url: string, ms: number): Promise<string> {
  const ctrl = new AbortController()
  const id = setTimeout(() => ctrl.abort(), ms)
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        Accept:
          "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
        "User-Agent":
          Deno.env.get("RSS_FETCH_USER_AGENT") ??
          "IndustryAINews-RSS/1.0 (+email-digest)"
      }
    })
    if (!r.ok) {
      throw new Error(`HTTP ${r.status}`)
    }
    return await r.text()
  } finally {
    clearTimeout(id)
  }
}

/** 按关注领域（内置 id + 自定义文案）聚合邮件简报条目 */
export async function collectDigestForDomains(
  domains: string[]
): Promise<DigestItem[]> {
  const presets = domains.filter(isPresetDomainId)
  const customs = domains.filter((d) => !isPresetDomainId(d))
  const all: DigestItem[] = []

  for (const pid of presets) {
    const urls = RSS_FEEDS[pid] ?? []
    for (const feedUrl of urls) {
      try {
        const xml = await fetchXml(feedUrl, 18_000)
        const items = parseFeedItems(xml, feedUrl).slice(0, MAX_ITEMS_PER_FEED)
        all.push(...items)
      } catch (e) {
        console.warn("[collect-digest] preset feed failed", feedUrl, e)
      }
    }
  }

  if (customs.length > 0) {
    for (const feedUrl of BROAD_FALLBACK_FEEDS) {
      try {
        const xml = await fetchXml(feedUrl, 18_000)
        const parsed = parseFeedItems(xml, feedUrl).slice(0, MAX_ITEMS_PER_FEED)
        for (const it of parsed) {
          const sum = it.summary ?? ""
          if (customs.some((c) => matchCustomDomain(c, it.title, sum))) {
            all.push(it)
          }
        }
      } catch (e) {
        console.warn("[collect-digest] broad feed failed", feedUrl, e)
      }
    }
  }

  const seen = new Set<string>()
  const dedup: DigestItem[] = []
  for (const it of all) {
    if (seen.has(it.url)) {
      continue
    }
    seen.add(it.url)
    dedup.push(it)
  }
  dedup.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1))
  return dedup.slice(0, MAX_DIGEST_ITEMS)
}
