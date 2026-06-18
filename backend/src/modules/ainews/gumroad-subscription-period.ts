/** 从 Gumroad Ping 解析支付时间并推算订阅周期结束时间 */

export function parseGumroadTimestamp(
  raw: string | undefined | null
): string | null {
  const s = (raw ?? "").trim()
  if (!s) {
    return null
  }
  const ms = Date.parse(s)
  if (!Number.isFinite(ms)) {
    return null
  }
  return new Date(ms).toISOString()
}

function addMonthsUtc(iso: string, months: number): string {
  const d = new Date(iso)
  const day = d.getUTCDate()
  d.setUTCMonth(d.getUTCMonth() + months)
  if (d.getUTCDate() < day) {
    d.setUTCDate(0)
  }
  return d.toISOString()
}

/** 根据 Gumroad recurrence / subscription_duration 推算当前周期结束时间 */
export function computePeriodEndFromPayment(
  paidAtIso: string,
  recurrence: string | undefined | null
): string {
  const r = (recurrence ?? "monthly").trim().toLowerCase()
  if (r === "yearly" || r === "annual" || r === "every_year") {
    return addMonthsUtc(paidAtIso, 12)
  }
  if (r === "quarterly" || r === "every_3_months") {
    return addMonthsUtc(paidAtIso, 3)
  }
  if (r === "biannually" || r === "every_6_months") {
    return addMonthsUtc(paidAtIso, 6)
  }
  return addMonthsUtc(paidAtIso, 1)
}

export function pickGumroadRecurrence(
  body: Record<string, string>
): string {
  return (
    body.recurrence ??
    body.subscription_duration ??
    "monthly"
  )
    .trim()
    .toLowerCase()
}

export function pickGumroadPaidAt(
  body: Record<string, string>
): string | null {
  return parseGumroadTimestamp(
    body.sale_timestamp ?? body.created_at ?? body.timestamp
  )
}

export function pickGumroadPeriodEndRaw(
  body: Record<string, string>
): string {
  return (
    body.subscription_ended_at ??
    body.ends_at ??
    body.cancelled_at ??
    body.subscription_cancelled_at ??
    ""
  ).trim()
}
