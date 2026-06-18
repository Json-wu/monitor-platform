-- 用户偏好存入 anon_users；user_prefs_logs 仅作操作审计日志

ALTER TABLE public.anon_users
  ADD COLUMN IF NOT EXISTS follow_domains text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS ui_lang text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ui_theme text NOT NULL DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS system_language text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS reminder_mode text NOT NULL DEFAULT 'realtime',
  ADD COLUMN IF NOT EXISTS reminder_dnd boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_interval_minutes int NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS reminder_window_start_hour int NOT NULL DEFAULT 9,
  ADD COLUMN IF NOT EXISTS reminder_window_end_hour int NOT NULL DEFAULT 18,
  ADD COLUMN IF NOT EXISTS user_tier text NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN public.anon_users.follow_domains IS '关注领域（内置 id + 自定义文案）';
COMMENT ON COLUMN public.anon_users.ui_lang IS '插件界面语言';
COMMENT ON COLUMN public.anon_users.ui_theme IS '主题：system | light | dark';
COMMENT ON COLUMN public.anon_users.system_language IS '浏览器 BCP-47 语言';
COMMENT ON COLUMN public.anon_users.user_tier IS '用户等级：free | monthly | monthly_pro';

CREATE INDEX IF NOT EXISTS anon_users_follow_domains_gin_idx
  ON public.anon_users USING gin (follow_domains);

COMMENT ON TABLE public.user_prefs_logs IS
  '用户操作审计日志（onboarding / 设置保存等）；当前偏好以 anon_users 为准。';

-- 从最新一条偏好日志回填 anon_users（已有用户升级迁移用）
UPDATE public.anon_users AS au
SET
  follow_domains = CASE
    WHEN au.follow_domains = '{}'::text[] AND l.follow_domains IS NOT NULL
    THEN l.follow_domains
    ELSE au.follow_domains
  END,
  ui_lang = CASE WHEN au.ui_lang = '' AND l.ui_lang <> '' THEN l.ui_lang ELSE au.ui_lang END,
  ui_theme = CASE WHEN au.ui_theme = 'system' AND l.ui_theme <> '' THEN l.ui_theme ELSE au.ui_theme END,
  system_language = CASE
    WHEN au.system_language = '' AND l.system_language <> '' THEN l.system_language
    ELSE au.system_language
  END,
  reminder_mode = CASE
    WHEN au.reminder_mode = 'realtime' AND l.reminder_mode <> '' THEN l.reminder_mode
    ELSE au.reminder_mode
  END,
  reminder_dnd = l.reminder_dnd,
  reminder_interval_minutes = CASE
    WHEN au.reminder_interval_minutes = 5 AND l.reminder_interval_minutes > 0
    THEN l.reminder_interval_minutes
    ELSE au.reminder_interval_minutes
  END,
  reminder_window_start_hour = CASE
    WHEN au.reminder_window_start_hour = 9 AND l.reminder_window_start_hour > 0
    THEN l.reminder_window_start_hour
    ELSE au.reminder_window_start_hour
  END,
  reminder_window_end_hour = CASE
    WHEN au.reminder_window_end_hour = 18 AND l.reminder_window_end_hour > 0
    THEN l.reminder_window_end_hour
    ELSE au.reminder_window_end_hour
  END,
  timezone = CASE WHEN au.timezone = '' AND l.timezone <> '' THEN l.timezone ELSE au.timezone END,
  updated_at = GREATEST(au.updated_at, l.created_at)
FROM (
  SELECT DISTINCT ON (user_id)
    user_id,
    follow_domains,
    timezone,
    reminder_mode,
    reminder_dnd,
    reminder_interval_minutes,
    reminder_window_start_hour,
    reminder_window_end_hour,
    ui_lang,
    ui_theme,
    system_language,
    created_at
  FROM public.user_prefs_logs
  ORDER BY user_id, created_at DESC
) AS l
WHERE au.id = l.user_id;
