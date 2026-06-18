import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1"

import {
  effectiveTierFromSubscription,
  limitsForTier,
  type EffectiveTier,
  type TierLimits
} from "./subscription-tier"

export type ResolvedAccount = {
  tier: EffectiveTier
  limits: TierLimits
  email: string | null
  subscription: {
    plan: string
    status: string
    lastPaidAt: string | null
    currentPeriodStart: string | null
    currentPeriodEnd: string | null
    recurrence: string | null
  } | null
}

export async function mergePendingForEmail(
  admin: SupabaseClient,
  email: string,
  userId: string
): Promise<void> {
  const normalized = email.trim().toLowerCase()
  const { data: pending } = await admin
    .from("pending_subscriptions")
    .select("*")
    .eq("email", normalized)
    .maybeSingle()
  if (!pending) {
    return
  }
  const now = new Date().toISOString()
  await admin.from("subscriptions").upsert(
    {
      user_id: userId,
      email: normalized,
      plan: pending.plan,
      status: pending.status,
      gumroad_product_id: pending.gumroad_product_id,
      gumroad_sale_id: pending.gumroad_sale_id,
      gumroad_subscription_id: pending.gumroad_subscription_id,
      last_paid_at: pending.last_paid_at,
      current_period_start: pending.current_period_start,
      current_period_end: pending.current_period_end,
      recurrence: pending.recurrence,
      raw_payload: pending.raw_payload,
      updated_at: now
    },
    { onConflict: "user_id" }
  )
  await admin.from("pending_subscriptions").delete().eq("email", normalized)
}

export async function resolveAccountForAuthUser(
  admin: SupabaseClient,
  userId: string,
  email: string | null
): Promise<ResolvedAccount> {
  if (email) {
    await mergePendingForEmail(admin, email, userId)
  }
  const { data: sub } = await admin
    .from("subscriptions")
    .select(
      "plan, status, last_paid_at, current_period_start, current_period_end, recurrence"
    )
    .eq("user_id", userId)
    .maybeSingle()

  const tier = effectiveTierFromSubscription(
    sub?.plan,
    sub?.status,
    sub?.current_period_end ?? null
  )
  return {
    tier,
    limits: limitsForTier(tier),
    email,
    subscription: sub
      ? {
          plan: sub.plan,
          status: sub.status,
          lastPaidAt: sub.last_paid_at ?? null,
          currentPeriodStart: sub.current_period_start ?? null,
          currentPeriodEnd: sub.current_period_end ?? null,
          recurrence: sub.recurrence ?? null
        }
      : null
  }
}

export function resolveAccountForAnon(): ResolvedAccount {
  const tier: EffectiveTier = "free"
  return {
    tier,
    limits: limitsForTier(tier),
    email: null,
    subscription: null
  }
}
