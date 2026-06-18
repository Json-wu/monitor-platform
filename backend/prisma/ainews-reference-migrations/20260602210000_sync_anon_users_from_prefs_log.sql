-- 写入 user_prefs_logs 时同步 anon_users（兜底：Edge 未正确 upsert 时仍保持一致）
-- 并修复 follow_domains 为空但日志中已有数据的用户

CREATE OR REPLACE FUNCTION public.sync_anon_user_from_prefs_log()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.anon_users (
    id,
    timezone,
    last_seen_ip,
    follow_domains,
    ui_lang,
    ui_theme,
    system_language,
    reminder_mode,
    reminder_dnd,
    reminder_interval_minutes,
    reminder_window_start_hour,
    reminder_window_end_hour,
    updated_at,
    last_seen_at
  ) VALUES (
    NEW.user_id,
    COALESCE(NEW.timezone, ''),
    COALESCE(NEW.ip, ''),
    COALESCE(NEW.follow_domains, '{}'::text[]),
    COALESCE(NEW.ui_lang, ''),
    COALESCE(NULLIF(NEW.ui_theme, ''), 'system'),
    COALESCE(NEW.system_language, ''),
    COALESCE(NULLIF(NEW.reminder_mode, ''), 'realtime'),
    COALESCE(NEW.reminder_dnd, false),
    CASE
      WHEN NEW.reminder_interval_minutes > 0 THEN NEW.reminder_interval_minutes
      ELSE 5
    END,
    CASE
      WHEN NEW.reminder_window_start_hour > 0 THEN NEW.reminder_window_start_hour
      ELSE 9
    END,
    CASE
      WHEN NEW.reminder_window_end_hour > 0 THEN NEW.reminder_window_end_hour
      ELSE 18
    END,
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    timezone = EXCLUDED.timezone,
    last_seen_ip = EXCLUDED.last_seen_ip,
    follow_domains = EXCLUDED.follow_domains,
    ui_lang = EXCLUDED.ui_lang,
    ui_theme = EXCLUDED.ui_theme,
    system_language = EXCLUDED.system_language,
    reminder_mode = EXCLUDED.reminder_mode,
    reminder_dnd = EXCLUDED.reminder_dnd,
    reminder_interval_minutes = EXCLUDED.reminder_interval_minutes,
    reminder_window_start_hour = EXCLUDED.reminder_window_start_hour,
    reminder_window_end_hour = EXCLUDED.reminder_window_end_hour,
    updated_at = now(),
    last_seen_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_prefs_logs_sync_anon_users ON public.user_prefs_logs;

CREATE TRIGGER user_prefs_logs_sync_anon_users
  AFTER INSERT ON public.user_prefs_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_anon_user_from_prefs_log();

-- 一次性修复：日志有领域、主表为空的记录
UPDATE public.anon_users AS au
SET
  follow_domains = l.follow_domains,
  timezone = CASE WHEN l.timezone <> '' THEN l.timezone ELSE au.timezone END,
  ui_lang = CASE WHEN l.ui_lang <> '' THEN l.ui_lang ELSE au.ui_lang END,
  ui_theme = CASE WHEN l.ui_theme <> '' THEN l.ui_theme ELSE au.ui_theme END,
  system_language = CASE
    WHEN l.system_language <> '' THEN l.system_language
    ELSE au.system_language
  END,
  reminder_mode = CASE
    WHEN l.reminder_mode <> '' THEN l.reminder_mode
    ELSE au.reminder_mode
  END,
  reminder_dnd = l.reminder_dnd,
  reminder_interval_minutes = CASE
    WHEN l.reminder_interval_minutes > 0 THEN l.reminder_interval_minutes
    ELSE au.reminder_interval_minutes
  END,
  reminder_window_start_hour = CASE
    WHEN l.reminder_window_start_hour > 0 THEN l.reminder_window_start_hour
    ELSE au.reminder_window_start_hour
  END,
  reminder_window_end_hour = CASE
    WHEN l.reminder_window_end_hour > 0 THEN l.reminder_window_end_hour
    ELSE au.reminder_window_end_hour
  END,
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
  WHERE follow_domains <> '{}'::text[]
  ORDER BY user_id, created_at DESC
) AS l
WHERE au.id = l.user_id
  AND (au.follow_domains IS NULL OR au.follow_domains = '{}'::text[]);
