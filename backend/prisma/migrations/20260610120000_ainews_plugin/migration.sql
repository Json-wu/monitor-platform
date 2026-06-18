-- Industry AI News Chrome extension backend tables (migrated from Supabase)
-- Reference: backend/prisma/ainews-reference-migrations/

CREATE TABLE IF NOT EXISTS public.articles (
  id bigserial PRIMARY KEY,
  canonical_url text NOT NULL UNIQUE,
  source_url text NOT NULL,
  title text NOT NULL,
  published_at timestamptz NOT NULL,
  source text NOT NULL DEFAULT '',
  domains text[] NOT NULL DEFAULT '{}',
  raw_summary text,
  image_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS articles_published_at_idx ON public.articles (published_at DESC);
CREATE INDEX IF NOT EXISTS articles_domains_gin_idx ON public.articles USING gin (domains);

CREATE TABLE IF NOT EXISTS public.article_summary_cache (
  url text NOT NULL,
  locale text NOT NULL DEFAULT 'en',
  title text NOT NULL DEFAULT '',
  summary text NOT NULL DEFAULT '',
  model text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (url, locale)
);

CREATE TABLE IF NOT EXISTS public.anon_users (
  id uuid PRIMARY KEY,
  email text NOT NULL DEFAULT '',
  timezone text NOT NULL DEFAULT '',
  follow_domains text[] NOT NULL DEFAULT '{}',
  ui_lang text NOT NULL DEFAULT '',
  ui_theme text NOT NULL DEFAULT 'system',
  system_language text NOT NULL DEFAULT '',
  reminder_mode text NOT NULL DEFAULT 'realtime',
  reminder_dnd boolean NOT NULL DEFAULT false,
  reminder_interval_minutes int NOT NULL DEFAULT 5,
  reminder_window_start_hour int NOT NULL DEFAULT 9,
  reminder_window_end_hour int NOT NULL DEFAULT 18,
  user_tier text NOT NULL DEFAULT 'free',
  device_id text NOT NULL DEFAULT '',
  end_user_id uuid REFERENCES public.end_user(id) ON DELETE SET NULL,
  linked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_ip text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS anon_users_device_id_unique_idx
  ON public.anon_users (device_id) WHERE device_id <> '';
CREATE UNIQUE INDEX IF NOT EXISTS anon_users_end_user_id_unique_idx
  ON public.anon_users (end_user_id) WHERE end_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS anon_users_last_seen_at_idx ON public.anon_users (last_seen_at DESC);
CREATE INDEX IF NOT EXISTS anon_users_follow_domains_gin_idx ON public.anon_users USING gin (follow_domains);

CREATE TABLE IF NOT EXISTS public.user_prefs_logs (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL,
  ip text NOT NULL DEFAULT '',
  timezone text NOT NULL DEFAULT '',
  follow_domains text[] NOT NULL DEFAULT '{}',
  reminder_mode text NOT NULL DEFAULT '',
  reminder_dnd boolean NOT NULL DEFAULT false,
  reminder_interval_minutes int NOT NULL DEFAULT 0,
  reminder_window_start_hour int NOT NULL DEFAULT 0,
  reminder_window_end_hour int NOT NULL DEFAULT 0,
  ui_lang text NOT NULL DEFAULT '',
  ui_theme text NOT NULL DEFAULT '',
  system_language text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_prefs_logs_created_at_idx ON public.user_prefs_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS user_prefs_logs_user_id_idx ON public.user_prefs_logs (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.article_user_state (
  user_id uuid NOT NULL,
  canonical_url text NOT NULL,
  liked boolean NOT NULL DEFAULT false,
  disliked boolean NOT NULL DEFAULT false,
  read boolean NOT NULL DEFAULT false,
  like_count int NOT NULL DEFAULT 0,
  dislike_count int NOT NULL DEFAULT 0,
  read_count int NOT NULL DEFAULT 0,
  liked_at timestamptz,
  disliked_at timestamptz,
  read_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, canonical_url)
);

CREATE TABLE IF NOT EXISTS public.article_action_events (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL,
  action text NOT NULL,
  canonical_url text NOT NULL,
  source_url text NOT NULL DEFAULT '',
  ip text NOT NULL DEFAULT '',
  timezone text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS article_action_events_created_at_idx ON public.article_action_events (created_at DESC);

CREATE TABLE IF NOT EXISTS public.user_extension_preferences (
  end_user_id uuid PRIMARY KEY REFERENCES public.end_user(id) ON DELETE CASCADE,
  industry_ids text[] NOT NULL DEFAULT '{}',
  is_pro boolean NOT NULL DEFAULT false,
  reminder_mode text NOT NULL DEFAULT 'every2h',
  reminder_email text NOT NULL DEFAULT '',
  news_mock_only boolean NOT NULL DEFAULT false,
  ui_theme text NOT NULL DEFAULT 'light',
  onboarding_complete boolean NOT NULL DEFAULT false,
  follow_keywords text[] NOT NULL DEFAULT '{}',
  last_email_digest_at timestamptz,
  email_digest_opt_out boolean NOT NULL DEFAULT false,
  timezone text NOT NULL DEFAULT 'UTC',
  ui_lang text NOT NULL DEFAULT 'en',
  last_daily_digest_date date,
  email_digest_trial_sent_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_llm_usage_daily (
  user_id uuid NOT NULL,
  usage_day date NOT NULL,
  summarize_calls int NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, usage_day)
);

CREATE TABLE IF NOT EXISTS public.pending_subscriptions (
  email text PRIMARY KEY,
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

CREATE TABLE IF NOT EXISTS public.email_digest_briefs (
  id bigserial PRIMARY KEY,
  end_user_id uuid NOT NULL REFERENCES public.end_user(id) ON DELETE CASCADE,
  digest_date date NOT NULL,
  brief_html text NOT NULL DEFAULT '',
  brief_text text NOT NULL DEFAULT '',
  download_token text,
  pdf_storage_path text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS email_digest_briefs_user_date_idx
  ON public.email_digest_briefs (end_user_id, digest_date);

CREATE TABLE IF NOT EXISTS public.edge_job_locks (
  job_name text PRIMARY KEY,
  locked_until timestamptz NOT NULL,
  worker_id text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
