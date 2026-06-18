/** Edge 与 lib/published-at.ts 保持逻辑一致（Deno 无法直接 import 扩展 lib） */

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/

export function isUsEasternDaylightTime(ms: number): boolean {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      timeZoneName: "shortOffset"
    }).formatToParts(new Date(ms))
    const tz = parts.find((p) => p.type === "timeZoneName")?.value ?? ""
    return tz.includes("-4")
  } catch {
    return false
  }
}

export function fixUsEasternAbbrevInRfc822(raw: string): string {
  if (!/\bEST\b/i.test(raw)) {
    return raw
  }
  const asEdt = raw.replace(/\bEST\b/i, "EDT")
  const probe = new Date(asEdt)
  if (Number.isNaN(probe.getTime())) {
    return raw
  }
  if (isUsEasternDaylightTime(probe.getTime())) {
    return asEdt
  }
  return raw
}

export function normalizePublishedAtIso(raw: string): string | null {
  const s = raw.trim()
  if (!s) {
    return null
  }

  const dateOnly = s.match(DATE_ONLY)
  if (dateOnly) {
    const y = parseInt(dateOnly[1], 10)
    const m = parseInt(dateOnly[2], 10)
    const d = parseInt(dateOnly[3], 10)
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
      return null
    }
    return new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0)).toISOString()
  }

  const fixed = fixUsEasternAbbrevInRfc822(s)
  const date = new Date(fixed)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  return date.toISOString()
}
