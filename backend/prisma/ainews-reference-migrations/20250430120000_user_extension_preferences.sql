-- Extension preferences: one row per user (multi-device sync).
-- Works in both Supabase Postgres and plain local Postgres.

CREATE TABLE IF NOT EXISTS public.user_extension_preferences (
  user_id uuid PRIMARY KEY,
  industry_ids text[] NOT NULL DEFAULT '{}'::text[],
  is_pro boolean NOT NULL DEFAULT false,
  reminder_mode text NOT NULL DEFAULT 'every2h',
  reminder_email text NOT NULL DEFAULT '',
  news_mock_only boolean NOT NULL DEFAULT false,
  ui_theme text NOT NULL DEFAULT 'light',
  onboarding_complete boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_extension_preferences_reminder_mode_check
    CHECK (reminder_mode IN ('every2h', 'dnd', 'twiceDaily')),
  CONSTRAINT user_extension_preferences_ui_theme_check
    CHECK (ui_theme IN ('light', 'dark'))
);

CREATE INDEX IF NOT EXISTS user_extension_preferences_updated_at_idx
  ON public.user_extension_preferences (updated_at DESC);

-- Add FK to auth.users only when running in Supabase (auth schema exists).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'auth' AND table_name = 'users'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_extension_preferences_user_id_fkey'
  ) THEN
    ALTER TABLE public.user_extension_preferences
      ADD CONSTRAINT user_extension_preferences_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE;
  END IF;
END $$;

-- Supabase-only RLS/policies/GRANT.
DO $$
BEGIN
  IF to_regprocedure('auth.uid()') IS NOT NULL
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
  THEN
    ALTER TABLE public.user_extension_preferences ENABLE ROW LEVEL SECURITY;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'user_extension_preferences'
        AND policyname = 'extension_prefs_select_own'
    ) THEN
      CREATE POLICY "extension_prefs_select_own"
        ON public.user_extension_preferences
        FOR SELECT
        TO authenticated
        USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'user_extension_preferences'
        AND policyname = 'extension_prefs_insert_own'
    ) THEN
      CREATE POLICY "extension_prefs_insert_own"
        ON public.user_extension_preferences
        FOR INSERT
        TO authenticated
        WITH CHECK (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'user_extension_preferences'
        AND policyname = 'extension_prefs_update_own'
    ) THEN
      CREATE POLICY "extension_prefs_update_own"
        ON public.user_extension_preferences
        FOR UPDATE
        TO authenticated
        USING (auth.uid() = user_id)
        WITH CHECK (auth.uid() = user_id);
    END IF;

    GRANT SELECT, INSERT, UPDATE ON public.user_extension_preferences TO authenticated;
  END IF;
END $$;
