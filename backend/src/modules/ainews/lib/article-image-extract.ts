/** Edge 与 lib/article-image-extract.ts 逻辑一致 */

const HTTP_IMAGE = /^https?:\/\//i

function decodeBasicEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

export function normalizeHttpImageUrl(
  url: string | undefined | null
): string | undefined {
  if (!url || typeof url !== "string") {
    return undefined
  }
  let u = decodeBasicEntities(url.trim())
  if (u.startsWith("//")) {
    u = `https:${u}`
  }
  if (!HTTP_IMAGE.test(u)) {
    return undefined
  }
  return u
}

export function isUsableArticleImageUrl(url: string): boolean {
  const u = url.toLowerCase()
  if (/^data:/.test(u)) {
    return false
  }
  if (/\.svg(\?|$)/.test(u)) {
    return false
  }
  if (
    /favicon|pixel\.gif|spacer\.|1x1\.|transparent\.gif|\/ads\/|doubleclick|facebook\.com\/tr/i.test(
      u
    )
  ) {
    return false
  }
  if (/teamlogos|espn_dotcom_black|\/icon[-_]?\d{1,2}x/i.test(u)) {
    return false
  }
  return true
}

export type ImageCandidate = { url: string; score: number }

function addCandidate(out: ImageCandidate[], url: string | undefined, score: number) {
  const u = normalizeHttpImageUrl(url)
  if (!u || !isUsableArticleImageUrl(u)) {
    return
  }
  out.push({ url: u, score })
}

function metaContent(html: string, key: string): string | undefined {
  const patterns = [
    new RegExp(
      `<meta\\s+[^>]*(?:property|name)=["']${key}["'][^>]*content=["']([^"']+)["']`,
      "i"
    ),
    new RegExp(
      `<meta\\s+[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']${key}["']`,
      "i"
    )
  ]
  for (const re of patterns) {
    const m = html.match(re)
    if (m?.[1]) {
      return m[1]
    }
  }
  return undefined
}

function linkRelImage(html: string): string | undefined {
  const m = html.match(
    /<link\s+[^>]*rel=["']image_src["'][^>]*href=["']([^"']+)["']/i
  )
  return m?.[1]
}

function collectJsonLdImages(data: unknown, out: string[]) {
  if (data == null) {
    return
  }
  if (Array.isArray(data)) {
    for (const x of data) {
      collectJsonLdImages(x, out)
    }
    return
  }
  if (typeof data !== "object") {
    return
  }
  const o = data as Record<string, unknown>
  const image = o.image
  if (typeof image === "string") {
    out.push(image)
  } else if (Array.isArray(image)) {
    for (const x of image) {
      if (typeof x === "string") {
        out.push(x)
      } else if (x && typeof x === "object" && typeof (x as { url?: string }).url === "string") {
        out.push((x as { url: string }).url)
      }
    }
  } else if (image && typeof image === "object" && typeof (image as { url?: string }).url === "string") {
    out.push((image as { url: string }).url)
  }
  if (typeof o.thumbnailUrl === "string") {
    out.push(o.thumbnailUrl)
  }
  for (const v of Object.values(o)) {
    if (v && typeof v === "object") {
      collectJsonLdImages(v, out)
    }
  }
}

function jsonLdImages(html: string): string[] {
  const out: string[] = []
  const re =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    try {
      collectJsonLdImages(JSON.parse(m[1]), out)
    } catch {
      /* ignore */
    }
  }
  return out
}

const IMG_ATTRS = [
  "src",
  "data-src",
  "data-lazy-src",
  "data-original",
  "data-img-url",
  "data-hi-res-src"
]

export function firstImgSrcInHtml(html: string): string | undefined {
  if (!html) {
    return undefined
  }
  for (const attr of IMG_ATTRS) {
    const re = new RegExp(`<img\\b[^>]*\\b${attr}=["']([^"']+)["']`, "i")
    const m = html.match(re)
    if (m?.[1]) {
      const u = normalizeHttpImageUrl(m[1])
      if (u && isUsableArticleImageUrl(u)) {
        return u
      }
    }
  }
  const srcset = html.match(/<img\b[^>]*\bsrcset=["']([^"']+)["']/i)
  if (srcset?.[1]) {
    for (const part of srcset[1].split(",")) {
      const u = normalizeHttpImageUrl(part.trim().split(/\s+/)[0])
      if (u && isUsableArticleImageUrl(u)) {
        return u
      }
    }
  }
  const poster = html.match(/<video\b[^>]*\bposter=["']([^"']+)["']/i)
  if (poster?.[1]) {
    const u = normalizeHttpImageUrl(poster[1])
    if (u && isUsableArticleImageUrl(u)) {
      return u
    }
  }
  return undefined
}

export function extractImageCandidatesFromHtml(html: string): ImageCandidate[] {
  const head = html.slice(0, 600_000)
  const out: ImageCandidate[] = []

  addCandidate(out, metaContent(head, "og:image:secure_url"), 100)
  addCandidate(out, metaContent(head, "og:image"), 95)
  addCandidate(out, metaContent(head, "twitter:image"), 90)
  addCandidate(out, metaContent(head, "twitter:image:src"), 88)
  addCandidate(out, linkRelImage(head), 85)

  for (const url of jsonLdImages(head)) {
    addCandidate(out, url, 80)
  }

  addCandidate(out, firstImgSrcInHtml(head), 50)

  return out
}

export function pickBestImageUrl(candidates: ImageCandidate[]): string | undefined {
  if (candidates.length === 0) {
    return undefined
  }
  return [...candidates].sort((a, b) => b.score - a.score)[0]?.url
}

export function extractBestImageFromHtml(html: string): string | undefined {
  return pickBestImageUrl(extractImageCandidatesFromHtml(html))
}
