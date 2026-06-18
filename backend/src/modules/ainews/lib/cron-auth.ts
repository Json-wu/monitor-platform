/** Cron 任务鉴权：请求头 x-cron-secret 与 Edge Secret 一致。 */
export function cronAuthorized(
  req: Request,
  secretEnvKeys: string[]
): boolean {
  let secret = ""
  for (const key of secretEnvKeys) {
    const v = Deno.env.get(key)
    if (v) {
      secret = v
      break
    }
  }
  if (!secret) {
    return false
  }
  const got =
    req.headers.get("x-cron-secret") ?? req.headers.get("X-Cron-Secret") ?? ""
  return got.length > 0 && got === secret
}

export const INGEST_CRON_SECRETS = [
  "INGEST_CRON_SECRET",
  "EMAIL_DIGEST_CRON_SECRET"
] as const

export const SUMMARIZE_CRON_SECRETS = [
  "SUMMARIZE_CRON_SECRET",
  "INGEST_CRON_SECRET",
  "EMAIL_DIGEST_CRON_SECRET"
] as const
