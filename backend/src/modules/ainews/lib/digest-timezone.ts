/** 每日汇总在用户本地时区的发送小时（24h 制） */
export const DAILY_DIGEST_LOCAL_HOUR = 22

export const NEWS_RECENCY_HOURS = 24

export type LocalDateTimeParts = {
  hour: number
  dateKey: string
}

function partValue(parts: Intl.DateTimeFormatPart[], type: string): string {
  return parts.find((p) => p.type === type)?.value ?? ""
}

/** 将 instant 格式化为用户时区的日期键 YYYY-MM-DD 与小时（0–23）。无效时区回退 UTC。 */
export function localDateTimeParts(
  timezone: string,
  at: Date = new Date()
): LocalDateTimeParts {
  const tz = normalizeTimeZone(timezone)
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "numeric",
      hour12: false
    })
    const parts = fmt.formatToParts(at)
    const y = partValue(parts, "year")
    const m = partValue(parts, "month")
    const d = partValue(parts, "day")
    let hour = parseInt(partValue(parts, "hour"), 10)
    if (hour === 24) {
      hour = 0
    }
    return {
      hour: Number.isFinite(hour) ? hour : 0,
      dateKey: `${y}-${m}-${d}`
    }
  } catch {
    if (tz !== "UTC") {
      return localDateTimeParts("UTC", at)
    }
    const iso = at.toISOString()
    return {
      hour: parseInt(iso.slice(11, 13), 10),
      dateKey: iso.slice(0, 10)
    }
  }
}

export function normalizeTimeZone(timezone: string | null | undefined): string {
  const t = (timezone ?? "").trim()
  if (!t) {
    return "UTC"
  }
  try {
    Intl.DateTimeFormat(undefined, { timeZone: t })
    return t
  } catch {
    return "UTC"
  }
}

/** 是否处于用户本地 22:00 窗口（整点 cron 触发，允许 ±0 小时即 hour===22）。 */
export function isDailyDigestSendWindow(
  timezone: string,
  at: Date = new Date()
): boolean {
  const { hour } = localDateTimeParts(timezone, at)
  return hour === DAILY_DIGEST_LOCAL_HOUR
}

export function sinceIsoForRecencyHours(
  hours: number,
  at: Date = new Date()
): string {
  return new Date(at.getTime() - hours * 3600_000).toISOString()
}
