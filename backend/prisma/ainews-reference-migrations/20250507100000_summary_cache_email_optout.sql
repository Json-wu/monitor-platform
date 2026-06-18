-- LLM 摘要缓存（按 URL，供 summarize-article 写入、邮件简报读取）
CREATE TABLE IF NOT EXISTS public.article_summary_cache (
  url text PRIMARY KEY,
  summary text NOT NULL,
  model text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.article_summary_cache ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.article_summary_cache IS
  'RSS 条目 URL 对应的模型摘要；仅 Edge（service_role）读写。';

-- 每用户每日 LLM 条目计数（limit 在 Edge 内读取环境变量）
CREATE TABLE IF NOT EXISTS public.user_llm_usage_daily (
  user_id uuid NOT NULL,
  usage_day date NOT NULL,
  summarize_calls int NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, usage_day)
);

ALTER TABLE public.user_llm_usage_daily ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'auth' AND table_name = 'users'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_llm_usage_daily_user_id_fkey'
  ) THEN
    ALTER TABLE public.user_llm_usage_daily
      ADD CONSTRAINT user_llm_usage_daily_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS user_llm_usage_daily_usage_day_idx
  ON public.user_llm_usage_daily (usage_day DESC);

ALTER TABLE public.user_extension_preferences
  ADD COLUMN IF NOT EXISTS email_digest_opt_out boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.user_extension_preferences.email_digest_opt_out IS
  '为 true 时不发送定时邮件简报（用户退订或设置中关闭）。';
