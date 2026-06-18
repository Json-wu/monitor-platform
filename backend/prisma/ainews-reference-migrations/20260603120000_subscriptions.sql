-- Gumroad 订阅（权威档位，挂 auth.users）

CREATE TABLE IF NOT EXISTS public.pending_subscriptions (
  email text PRIMARY KEY,
  plan text NOT NULL CHECK (plan IN ('pro', 'unlimited')),
  status text NOT NULL DEFAULT 'active',
  gumroad_sale_id text,
  gumroad_subscription_id text,
  gumroad_product_id text NOT NULL DEFAULT '',
  current_period_end timestamptz,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.pending_subscriptions IS
  'Gumroad Webhook 先到、用户尚未登录时按买家邮箱暂存；登录后合并进 subscriptions。';

CREATE UNIQUE INDEX IF NOT EXISTS pending_subscriptions_gumroad_sub_idx
  ON public.pending_subscriptions (gumroad_subscription_id)
  WHERE gumroad_subscription_id IS NOT NULL AND gumroad_subscription_id <> '';

CREATE TABLE IF NOT EXISTS public.subscriptions (
  user_id uuid PRIMARY KEY,
  email text NOT NULL,
  plan text NOT NULL CHECK (plan IN ('pro', 'unlimited')),
  status text NOT NULL DEFAULT 'active',
  gumroad_sale_id text,
  gumroad_subscription_id text,
  gumroad_product_id text NOT NULL DEFAULT '',
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.subscriptions IS
  '已登录用户的 Gumroad 订阅；plan=pro|unlimited，status=active|cancelled|expired|refunded。';

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_gumroad_sub_idx
  ON public.subscriptions (gumroad_subscription_id)
  WHERE gumroad_subscription_id IS NOT NULL AND gumroad_subscription_id <> '';

CREATE INDEX IF NOT EXISTS subscriptions_email_idx ON public.subscriptions (lower(email));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'auth' AND table_name = 'users'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_user_id_fkey'
  ) THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE public.anon_users
  ADD COLUMN IF NOT EXISTS auth_user_id uuid,
  ADD COLUMN IF NOT EXISTS linked_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS anon_users_auth_user_id_unique_idx
  ON public.anon_users (auth_user_id)
  WHERE auth_user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.user_id_for_email(p_email text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT id FROM auth.users WHERE lower(email) = lower(trim(p_email)) LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.user_id_for_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_id_for_email(text) TO service_role;
