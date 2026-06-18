import { XMLParser } from "fast-xml-parser"

import { normalizePublishedAtIso } from "./published-at"
import { stripHtmlText } from "./decode-html"
import { firstImgSrcInHtml, isUsableArticleImageUrl, normalizeHttpImageUrl } from "./article-image-extract"

export type DigestItem = {
  title: string
  url: string
  publishedAt: string
  source: string
  /** 用于自定义领域子串匹配 */
  summary?: string
  /** RSS media:thumbnail、enclosure 或正文 img */
  imageUrl?: string
}

function publishedAtFromRaw(pub: string): string {
  const trimmed = pub.trim()
  if (!trimmed) {
    return new Date().toISOString()
  }
  return normalizePublishedAtIso(trimmed) ?? trimmed.slice(0, 64)
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_"
})

function toArr<T>(x: T | T[] | undefined | null): T[] {
  if (x === undefined || x === null) {
    return []
  }
  return Array.isArray(x) ? x : [x]
}

function stripHtml(s: string): string {
  return stripHtmlText(s)
}

function itemDescription(raw: Record<string, unknown>): string {
  const desc = textFromMaybeObject(raw.description)
  if (desc) {
    return desc.slice(0, 400)
  }
  const encoded =
    textFromMaybeObject(raw["content:encoded"]) ||
    textFromMaybeObject(raw["content"])
  if (encoded) {
    return encoded.slice(0, 400)
  }
  return textFromMaybeObject(raw.summary).slice(0, 400)
}

function textFromMaybeObject(v: unknown): string {
  if (typeof v === "string") {
    return stripHtml(v)
  }
  if (v && typeof v === "object" && "#text" in (v as object)) {
    return stripHtml(String((v as Record<string, unknown>)["#text"]))
  }
  return ""
}

function textFromMaybeObjectRaw(v: unknown): string {
  if (typeof v === "string") {
    return v
  }
  if (v && typeof v === "object" && "#text" in (v as object)) {
    return String((v as Record<string, unknown>)["#text"])
  }
  return ""
}

const HTTP_IMAGE = /^https?:\/\//i
const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif)(\?|$)/i

function isImageEnclosure(url: string, type: string): boolean {
  const t = type.toLowerCase()
  return t.startsWith("image/") || IMAGE_EXT.test(url)
}

function mediaNodes(raw: Record<string, unknown>, key: string): Record<string, unknown>[] {
  return toArr<Record<string, unknown>>(raw[key] as never)
}

function thumbnailUrlFromRecord(raw: Record<string, unknown>): string | undefined {
  for (const key of ["media:thumbnail", "thumbnail"]) {
    for (const node of mediaNodes(raw, key)) {
      const url =
        typeof node?.["@_url"] === "string"
          ? (node["@_url"] as string)
          : typeof node?.url === "string"
            ? (node.url as string)
            : ""
      const u = normalizeHttpImageUrl(url)
      if (u && isUsableArticleImageUrl(u)) {
        return u
      }
    }
  }
  for (const node of mediaNodes(raw, "media:content")) {
    const url = typeof node?.["@_url"] === "string" ? (node["@_url"] as string) : ""
    const medium =
      typeof node?.["@_medium"] === "string"
        ? (node["@_medium"] as string).toLowerCase()
        : ""
    const type =
      typeof node?.["@_type"] === "string"
        ? (node["@_type"] as string).toLowerCase()
        : ""
    if (medium !== "image" && !type.startsWith("image/")) {
      continue
    }
    const u = normalizeHttpImageUrl(url)
    if (u && isUsableArticleImageUrl(u)) {
      return u
    }
  }
  return undefined
}

function enclosureUrlFromRecord(raw: Record<string, unknown>): string | undefined {
  for (const node of mediaNodes(raw, "enclosure")) {
    const url = typeof node?.["@_url"] === "string" ? (node["@_url"] as string) : ""
    const type = typeof node?.["@_type"] === "string" ? (node["@_type"] as string) : ""
    if (!url || !isImageEnclosure(url, type)) {
      continue
    }
    const u = normalizeHttpImageUrl(url)
    if (u && isUsableArticleImageUrl(u)) {
      return u
    }
  }
  return undefined
}

function htmlFieldsFromRecord(raw: Record<string, unknown>): string {
  return (
    textFromMaybeObjectRaw(raw.description) ||
    textFromMaybeObjectRaw(raw["content:encoded"]) ||
    textFromMaybeObjectRaw(raw.content) ||
    textFromMaybeObjectRaw(raw.summary)
  )
}

function findImageUrlInRecord(raw: Record<string, unknown>): string | undefined {
  return (
    thumbnailUrlFromRecord(raw) ??
    enclosureUrlFromRecord(raw) ??
    firstImgSrcInHtml(htmlFieldsFromRecord(raw))
  )
}

function firstAtomHref(entry: Record<string, unknown>): string {
  const links = toArr<Record<string, unknown>>(entry.link as never)
  for (const L of links) {
    const hrefAttr =
      typeof L?.["@_href"] === "string"
        ? (L["@_href"] as string)
        : typeof L?.href === "string"
          ? (L.href as string)
          : ""
    if (hrefAttr && /^https?:/i.test(hrefAttr)) {
      return hrefAttr
    }
    const t = textFromMaybeObject(L)
    if (t && /^https?:/i.test(t)) {
      return t.trim()
    }
  }
  const id = entry.id
  if (typeof id === "string" && /^https?:/i.test(id)) {
    return id.trim()
  }
  return ""
}

/** 从 RSS 2.0 / Atom 提取条目（够用 BBC + arXiv）。 */
export function parseFeedItems(
  xml: string,
  fallbackSource: string
): DigestItem[] {
  const root = parser.parse(xml) as Record<string, unknown>
  const out: DigestItem[] = []

  const rss = root.rss as Record<string, unknown> | undefined
  const channel = rss?.channel as Record<string, unknown> | undefined
  if (channel) {
    const channelTitle =
      typeof channel.title === "string"
        ? stripHtml(channel.title).slice(0, 80)
        : textFromMaybeObject(channel.title).slice(0, 80) || fallbackSource
    for (const raw of toArr<Record<string, unknown>>(channel.item as never)) {
      const title = textFromMaybeObject(raw.title).slice(0, 300)
      let url = ""
      if (typeof raw.link === "string") {
        url = raw.link.trim()
      } else {
        url = textFromMaybeObject(raw.link).trim()
      }
      const pub =
        typeof raw.pubDate === "string"
          ? raw.pubDate
          : typeof raw["dc:date"] === "string"
            ? (raw["dc:date"] as string)
            : ""
      if (title && url && /^https?:/i.test(url)) {
        const summary = itemDescription(raw) || title
        const imageUrl = findImageUrlInRecord(raw)
        out.push({
          title,
          url,
          publishedAt: publishedAtFromRaw(pub),
          source: channelTitle || fallbackSource,
          summary,
          ...(imageUrl ? { imageUrl } : {})
        })
      }
    }
    return out
  }

  const feed = root.feed as Record<string, unknown> | undefined
  if (feed?.entry) {
    const feedTitle =
      typeof feed.title === "string"
        ? stripHtml(feed.title).slice(0, 80)
        : textFromMaybeObject(feed.title).slice(0, 80) || fallbackSource
    for (const entry of toArr<Record<string, unknown>>(feed.entry as never)) {
      const title = textFromMaybeObject(entry.title).slice(0, 300)
      const url = firstAtomHref(entry)
      let pub = ""
      if (typeof entry.published === "string") {
        pub = entry.published
      }
      if (typeof entry.updated === "string") {
        pub = pub || entry.updated
      }
      if (title && url) {
        const summary =
          textFromMaybeObject(entry.summary).slice(0, 400) ||
          textFromMaybeObject(entry.content).slice(0, 400) ||
          title
        const imageUrl = findImageUrlInRecord(entry)
        out.push({
          title,
          url,
          publishedAt: publishedAtFromRaw(pub),
          source: feedTitle || fallbackSource,
          summary,
          ...(imageUrl ? { imageUrl } : {})
        })
      }
    }
  }

  return out
}
