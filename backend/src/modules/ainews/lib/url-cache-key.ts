/** 与仓库 `lib/url-cache-key.ts` 保持一致。 */
export function canonicalUrlForSummaryCache(raw: string): string {
  const s = raw.trim()
  if (!s) {
    return ""
  }
  try {
    const u = new URL(s)
    u.hash = ""
    if (u.pathname !== "/" && u.pathname.endsWith("/")) {
      u.pathname = u.pathname.replace(/\/+$/, "") || "/"
    }
    return u.toString()
  } catch {
    return s
  }
}
