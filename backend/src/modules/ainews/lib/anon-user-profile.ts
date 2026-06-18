import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1"

export type AnonUserProfileRow = {
  id: string
  device_id?: string
  timezone: string
  last_seen_at: string
  last_seen_ip: string
  follow_domains: string[]
  ui_lang: string
  ui_theme: string
  system_language: string
  reminder_mode: string
  reminder_dnd: boolean
  reminder_interval_minutes: number
  reminder_window_start_hour: number
  reminder_window_end_hour: number
  user_tier: string
  updated_at: string
  email?: string
}

/** 显式 insert / update，避免 upsert 漏写 text[] 等字段。 */
export async function saveAnonUserProfile(
  admin: SupabaseClient,
  profile: AnonUserProfileRow
): Promise<{ error: string | null }> {
  const { id, email, ...fields } = profile
  const patch: Record<string, unknown> = { ...fields }
  if (email !== undefined && email.length > 0) {
    patch.email = email
  }

  const { data: existing, error: readErr } = await admin
    .from("anon_users")
    .select("id")
    .eq("id", id)
    .maybeSingle()

  if (readErr) {
    return { error: readErr.message }
  }

  if (existing) {
    const { error } = await admin.from("anon_users").update(patch).eq("id", id)
    return { error: error?.message ?? null }
  }

  const { error } = await admin.from("anon_users").insert({
    id,
    ...patch
  })
  return { error: error?.message ?? null }
}

/** 仅刷新活跃时间，不覆盖 follow_domains 等偏好字段。 */
export async function touchAnonUserLastSeen(
  admin: SupabaseClient,
  params: { id: string; timezone: string; last_seen_at: string; last_seen_ip: string }
): Promise<void> {
  const { data, error: updateErr } = await admin
    .from("anon_users")
    .update({
      timezone: params.timezone,
      last_seen_at: params.last_seen_at,
      last_seen_ip: params.last_seen_ip
    })
    .eq("id", params.id)
    .select("id")

  if (updateErr) {
    console.warn("[anon_users] touch update", updateErr.message)
  }
  if (data && data.length > 0) {
    return
  }

  const { error: insertErr } = await admin.from("anon_users").insert({
    id: params.id,
    timezone: params.timezone,
    last_seen_at: params.last_seen_at,
    last_seen_ip: params.last_seen_ip
  })
  if (insertErr) {
    console.warn("[anon_users] touch insert", insertErr.message)
  }
}
