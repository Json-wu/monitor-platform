import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1"

export type JobLockResult =
  | { acquired: true; workerId: string; lockedUntil: string }
  | { acquired: false; lockedUntil: string | null }

/** 尝试获取任务锁；已有未过期锁则返回 acquired=false。 */
export async function tryAcquireJobLock(
  admin: SupabaseClient,
  jobName: string,
  ttlSeconds: number
): Promise<JobLockResult> {
  const workerId = crypto.randomUUID()
  const now = new Date()
  const lockedUntil = new Date(now.getTime() + Math.max(60, ttlSeconds) * 1000)
  const lockedUntilIso = lockedUntil.toISOString()
  const nowIso = now.toISOString()

  await admin
    .from("edge_job_locks")
    .delete()
    .eq("job_name", jobName)
    .lt("locked_until", nowIso)

  const { error } = await admin.from("edge_job_locks").insert({
    job_name: jobName,
    locked_at: nowIso,
    locked_until: lockedUntilIso,
    worker_id: workerId
  })

  if (!error) {
    return { acquired: true, workerId, lockedUntil: lockedUntilIso }
  }

  const { data: existing } = await admin
    .from("edge_job_locks")
    .select("locked_until")
    .eq("job_name", jobName)
    .maybeSingle()

  return {
    acquired: false,
    lockedUntil:
      existing && typeof (existing as { locked_until?: string }).locked_until === "string"
        ? (existing as { locked_until: string }).locked_until
        : null
  }
}

export async function releaseJobLock(
  admin: SupabaseClient,
  jobName: string,
  workerId: string
): Promise<void> {
  if (!workerId) {
    return
  }
  await admin
    .from("edge_job_locks")
    .delete()
    .eq("job_name", jobName)
    .eq("worker_id", workerId)
}
