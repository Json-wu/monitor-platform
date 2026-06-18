ALTER TABLE public.user_extension_preferences
  ADD COLUMN IF NOT EXISTS follow_keywords text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN public.user_extension_preferences.follow_keywords IS
  'Extension keyword watchlist for in-list highlighting (stored lowercase-normalized server-side optional; client sends trimmed tokens).';
