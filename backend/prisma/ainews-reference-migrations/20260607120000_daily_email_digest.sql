-- 每日邮件汇总：用户时区、界面语言、简报存档

ALTER TABLE public.user_extension_preferences
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'UTC';

ALTER TABLE public.user_extension_preferences
  ADD COLUMN IF NOT EXISTS ui_lang text NOT NULL DEFAULT 'en';

ALTER TABLE public.user_extension_preferences
  ADD COLUMN IF NOT EXISTS last_daily_digest_date date;

COMMENT ON COLUMN public.user_extension_preferences.timezone IS
  'IANA 时区（如 Asia/Shanghai），用于本地 22:00 发信';

COMMENT ON COLUMN public.user_extension_preferences.ui_lang IS
  '邮件简报语言（zh / en 等，与扩展 uiLang 对齐）';

COMMENT ON COLUMN public.user_extension_preferences.last_daily_digest_date IS
  '用户本地时区下最近一次成功发送每日汇总的日期（防重复）';

CREATE TABLE IF NOT EXISTS public.email_digest_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  digest_date date NOT NULL,
  locale text NOT NULL DEFAULT 'en',
  title text NOT NULL DEFAULT '',
  brief_html text NOT NULL DEFAULT '',
  brief_text text NOT NULL DEFAULT '',
  pdf_storage_path text,
  download_token text NOT NULL,
  article_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, digest_date)
);

CREATE INDEX IF NOT EXISTS email_digest_briefs_user_id_idx
  ON public.email_digest_briefs (user_id, digest_date DESC);

COMMENT ON TABLE public.email_digest_briefs IS
  '每日 DeepSeek 汇总简报存档；PDF 存于 Storage digest-pdfs bucket。';

ALTER TABLE public.email_digest_briefs ENABLE ROW LEVEL SECURITY;

-- Storage bucket for generated PDFs (private; download via signed edge function)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'digest-pdfs',
  'digest-pdfs',
  false,
  5242880,
  ARRAY['application/pdf']::text[]
)
ON CONFLICT (id) DO NOTHING;
