-- Merge anon_users profile into end_user (single terminal user table for admin).

ALTER TABLE "end_user" ADD COLUMN IF NOT EXISTS "ainews_device_id" TEXT NOT NULL DEFAULT '';
ALTER TABLE "end_user" ADD COLUMN IF NOT EXISTS "ainews_email" TEXT NOT NULL DEFAULT '';
ALTER TABLE "end_user" ADD COLUMN IF NOT EXISTS "ainews_timezone" TEXT NOT NULL DEFAULT '';
ALTER TABLE "end_user" ADD COLUMN IF NOT EXISTS "ainews_follow_domains" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "end_user" ADD COLUMN IF NOT EXISTS "ainews_ui_lang" TEXT NOT NULL DEFAULT '';
ALTER TABLE "end_user" ADD COLUMN IF NOT EXISTS "ainews_ui_theme" TEXT NOT NULL DEFAULT 'system';
ALTER TABLE "end_user" ADD COLUMN IF NOT EXISTS "ainews_system_language" TEXT NOT NULL DEFAULT '';
ALTER TABLE "end_user" ADD COLUMN IF NOT EXISTS "ainews_reminder_mode" TEXT NOT NULL DEFAULT 'realtime';
ALTER TABLE "end_user" ADD COLUMN IF NOT EXISTS "ainews_reminder_dnd" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "end_user" ADD COLUMN IF NOT EXISTS "ainews_reminder_interval_minutes" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "end_user" ADD COLUMN IF NOT EXISTS "ainews_reminder_window_start_hour" INTEGER NOT NULL DEFAULT 9;
ALTER TABLE "end_user" ADD COLUMN IF NOT EXISTS "ainews_reminder_window_end_hour" INTEGER NOT NULL DEFAULT 18;
ALTER TABLE "end_user" ADD COLUMN IF NOT EXISTS "ainews_user_tier" TEXT NOT NULL DEFAULT 'free';
ALTER TABLE "end_user" ADD COLUMN IF NOT EXISTS "ainews_last_seen_ip" TEXT NOT NULL DEFAULT '';
ALTER TABLE "end_user" ADD COLUMN IF NOT EXISTS "ainews_linked_at" TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS "end_user_app_id_ainews_device_id_idx"
  ON "end_user"("app_id", "ainews_device_id");

CREATE UNIQUE INDEX IF NOT EXISTS "end_user_app_id_ainews_device_id_unique_idx"
  ON "end_user"("app_id", "ainews_device_id")
  WHERE "ainews_device_id" <> '';

-- Migrate anon_users → end_user when legacy table exists.
DO $$
DECLARE
  app_uuid UUID;
BEGIN
  IF to_regclass('public.anon_users') IS NULL THEN
    RETURN;
  END IF;

  SELECT id INTO app_uuid FROM application WHERE slug = 'chrome-ainews' LIMIT 1;
  IF app_uuid IS NULL THEN
    RAISE NOTICE 'chrome-ainews application not found; skip anon_users data migration';
    RETURN;
  END IF;

  -- Guest rows (no linked OAuth account): preserve anon id as end_user id.
  INSERT INTO end_user (
    id, app_id, email, oauth_provider, oauth_id, status, metadata,
    created_at, updated_at, last_active_at,
    ainews_device_id, ainews_email, ainews_timezone, ainews_follow_domains,
    ainews_ui_lang, ainews_ui_theme, ainews_system_language,
    ainews_reminder_mode, ainews_reminder_dnd, ainews_reminder_interval_minutes,
    ainews_reminder_window_start_hour, ainews_reminder_window_end_hour,
    ainews_user_tier, ainews_last_seen_ip
  )
  SELECT
    au.id,
    app_uuid,
    'guest+' || replace(au.id::text, '-', '') || '@ainews.internal',
    'device',
    NULLIF(trim(au.device_id), ''),
    'active',
    '{}'::jsonb,
    au.created_at,
    COALESCE(au.updated_at, au.created_at),
    au.last_seen_at,
    COALESCE(au.device_id, ''),
    COALESCE(au.email, ''),
    COALESCE(au.timezone, ''),
    COALESCE(au.follow_domains, ARRAY[]::text[]),
    COALESCE(au.ui_lang, ''),
    COALESCE(au.ui_theme, 'system'),
    COALESCE(au.system_language, ''),
    COALESCE(au.reminder_mode, 'realtime'),
    COALESCE(au.reminder_dnd, false),
    COALESCE(au.reminder_interval_minutes, 5),
    COALESCE(au.reminder_window_start_hour, 9),
    COALESCE(au.reminder_window_end_hour, 18),
    COALESCE(au.user_tier, 'free'),
    COALESCE(au.last_seen_ip, '')
  FROM anon_users au
  WHERE au.end_user_id IS NULL
  ON CONFLICT (id) DO UPDATE SET
    last_active_at = GREATEST(end_user.last_active_at, EXCLUDED.last_active_at),
    ainews_device_id = CASE WHEN trim(end_user.ainews_device_id) = '' THEN EXCLUDED.ainews_device_id ELSE end_user.ainews_device_id END,
    ainews_email = CASE WHEN trim(end_user.ainews_email) = '' THEN EXCLUDED.ainews_email ELSE end_user.ainews_email END,
    ainews_timezone = CASE WHEN trim(end_user.ainews_timezone) = '' THEN EXCLUDED.ainews_timezone ELSE end_user.ainews_timezone END,
    ainews_follow_domains = CASE WHEN cardinality(end_user.ainews_follow_domains) = 0 THEN EXCLUDED.ainews_follow_domains ELSE end_user.ainews_follow_domains END,
    ainews_ui_lang = CASE WHEN trim(end_user.ainews_ui_lang) = '' THEN EXCLUDED.ainews_ui_lang ELSE end_user.ainews_ui_lang END,
    ainews_ui_theme = EXCLUDED.ainews_ui_theme,
    ainews_system_language = CASE WHEN trim(end_user.ainews_system_language) = '' THEN EXCLUDED.ainews_system_language ELSE end_user.ainews_system_language END,
    ainews_reminder_mode = EXCLUDED.ainews_reminder_mode,
    ainews_reminder_dnd = EXCLUDED.ainews_reminder_dnd,
    ainews_reminder_interval_minutes = EXCLUDED.ainews_reminder_interval_minutes,
    ainews_reminder_window_start_hour = EXCLUDED.ainews_reminder_window_start_hour,
    ainews_reminder_window_end_hour = EXCLUDED.ainews_reminder_window_end_hour,
    ainews_user_tier = EXCLUDED.ainews_user_tier,
    ainews_last_seen_ip = EXCLUDED.ainews_last_seen_ip,
    updated_at = now();

  -- Linked rows: copy prefs onto OAuth end_user.
  UPDATE end_user eu
  SET
    ainews_device_id = CASE WHEN trim(eu.ainews_device_id) = '' THEN COALESCE(NULLIF(trim(au.device_id), ''), eu.ainews_device_id) ELSE eu.ainews_device_id END,
    ainews_email = CASE WHEN trim(eu.ainews_email) = '' THEN COALESCE(NULLIF(trim(au.email), ''), eu.ainews_email) ELSE eu.ainews_email END,
    ainews_timezone = CASE WHEN trim(eu.ainews_timezone) = '' THEN COALESCE(au.timezone, eu.ainews_timezone) ELSE eu.ainews_timezone END,
    ainews_follow_domains = CASE WHEN cardinality(eu.ainews_follow_domains) = 0 THEN COALESCE(au.follow_domains, eu.ainews_follow_domains) ELSE eu.ainews_follow_domains END,
    ainews_ui_lang = CASE WHEN trim(eu.ainews_ui_lang) = '' THEN COALESCE(au.ui_lang, eu.ainews_ui_lang) ELSE eu.ainews_ui_lang END,
    ainews_ui_theme = COALESCE(NULLIF(trim(au.ui_theme), ''), eu.ainews_ui_theme),
    ainews_system_language = CASE WHEN trim(eu.ainews_system_language) = '' THEN COALESCE(au.system_language, eu.ainews_system_language) ELSE eu.ainews_system_language END,
    ainews_reminder_mode = COALESCE(NULLIF(trim(au.reminder_mode), ''), eu.ainews_reminder_mode),
    ainews_reminder_dnd = au.reminder_dnd,
    ainews_reminder_interval_minutes = au.reminder_interval_minutes,
    ainews_reminder_window_start_hour = au.reminder_window_start_hour,
    ainews_reminder_window_end_hour = au.reminder_window_end_hour,
    ainews_user_tier = COALESCE(NULLIF(trim(au.user_tier), ''), eu.ainews_user_tier),
    ainews_last_seen_ip = COALESCE(NULLIF(trim(au.last_seen_ip), ''), eu.ainews_last_seen_ip),
    ainews_linked_at = COALESCE(eu.ainews_linked_at, au.linked_at),
    last_active_at = GREATEST(eu.last_active_at, au.last_seen_at),
    updated_at = now()
  FROM anon_users au
  WHERE au.end_user_id = eu.id;

  -- Remap child rows from guest anon id → OAuth end_user id (skip conflicting article_user_state).
  UPDATE user_prefs_logs upl
  SET user_id = au.end_user_id
  FROM anon_users au
  WHERE upl.user_id = au.id
    AND au.end_user_id IS NOT NULL
    AND au.id <> au.end_user_id;

  UPDATE article_action_events aae
  SET user_id = au.end_user_id
  FROM anon_users au
  WHERE aae.user_id = au.id
    AND au.end_user_id IS NOT NULL
    AND au.id <> au.end_user_id;

  UPDATE user_llm_usage_daily uld
  SET user_id = au.end_user_id
  FROM anon_users au
  WHERE uld.user_id = au.id
    AND au.end_user_id IS NOT NULL
    AND au.id <> au.end_user_id
    AND NOT EXISTS (
      SELECT 1 FROM user_llm_usage_daily x
      WHERE x.user_id = au.end_user_id AND x.usage_day = uld.usage_day
    );

  DELETE FROM user_llm_usage_daily uld
  USING anon_users au
  WHERE uld.user_id = au.id
    AND au.end_user_id IS NOT NULL
    AND au.id <> au.end_user_id
    AND EXISTS (
      SELECT 1 FROM user_llm_usage_daily x
      WHERE x.user_id = au.end_user_id AND x.usage_day = uld.usage_day
    );

  DELETE FROM article_user_state aus
  USING anon_users au
  WHERE aus.user_id = au.id
    AND au.end_user_id IS NOT NULL
    AND au.id <> au.end_user_id
    AND EXISTS (
      SELECT 1 FROM article_user_state x
      WHERE x.user_id = au.end_user_id AND x.canonical_url = aus.canonical_url
    );

  UPDATE article_user_state aus
  SET user_id = au.end_user_id
  FROM anon_users au
  WHERE aus.user_id = au.id
    AND au.end_user_id IS NOT NULL
    AND au.id <> au.end_user_id;

  -- Remove guest end_user rows superseded by OAuth account.
  DELETE FROM end_user eu
  USING anon_users au
  WHERE eu.id = au.id
    AND au.end_user_id IS NOT NULL
    AND au.id <> au.end_user_id
    AND eu.oauth_provider = 'device';

  DROP TABLE IF EXISTS anon_users;
END $$;
