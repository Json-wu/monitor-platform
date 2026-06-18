-- Gumroad plugin tiers (AinewsPluginSubscription → public.subscriptions)
-- Idempotent: 20260610120000 may have been applied before this table was in that migration.

CREATE TABLE IF NOT EXISTS public.subscriptions (
  end_user_id uuid PRIMARY KEY REFERENCES public.end_user(id) ON DELETE CASCADE,
  email text NOT NULL,
  plan text NOT NULL CHECK (plan IN ('pro', 'unlimited')),
  status text NOT NULL DEFAULT 'active',
  gumroad_sale_id text,
  gumroad_subscription_id text,
  gumroad_product_id text NOT NULL DEFAULT '',
  last_paid_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  recurrence text,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_gumroad_sub_idx
  ON public.subscriptions (gumroad_subscription_id)
  WHERE gumroad_subscription_id IS NOT NULL AND gumroad_subscription_id <> '';
