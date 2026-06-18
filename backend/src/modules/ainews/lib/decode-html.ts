/** Edge 与 lib/text.ts decodeHtmlEntities 逻辑一致 */

const NAMED_HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00A0",
  ldquo: "\u201C",
  rdquo: "\u201D",
  lsquo: "\u2018",
  rsquo: "\u2019",
  mdash: "\u2014",
  ndash: "\u2013",
  hellip: "\u2026"
}

function codePointToChar(code: number): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) {
    return ""
  }
  try {
    return String.fromCodePoint(code)
  } catch {
    return ""
  }
}

export function decodeHtmlEntities(s: string): string {
  let out = s
  for (let pass = 0; pass < 3; pass++) {
    const next = out
      .replace(/&#x([0-9a-fA-F]+);?/gi, (_, hex: string) =>
        codePointToChar(parseInt(hex, 16))
      )
      .replace(/&#(\d+);?/g, (_, dec: string) =>
        codePointToChar(parseInt(dec, 10))
      )
      .replace(/&([a-zA-Z]+);/g, (full, name: string) => {
        const ch = NAMED_HTML_ENTITIES[name.toLowerCase()]
        return ch ?? full
      })
    if (next === out) {
      break
    }
    out = next
  }
  return out
}

export function stripHtmlText(s: string): string {
  return decodeHtmlEntities(
    s
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  )
}
