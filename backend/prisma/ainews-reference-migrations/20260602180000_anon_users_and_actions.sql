-- 匿名用户与行为统计（不依赖登录）

CREATE TABLE IF NOT EXISTS public.anon_users (
  id uuid PRIMARY KEY,
  email text NOT NULL DEFAULT '',
  timezone text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_ip text NOT NULL DEFAULT ''
);

COMMENT ON TABLE public.anon_users IS
  '匿名用户（扩展本地生成 uuid）；后续可与邮箱登录账号做映射。';

CREATE INDEX IF NOT EXISTS anon_users_last_seen_at_idx
  ON public.anon_users (last_seen_at DESC);

CREATE TABLE IF NOT EXISTS public.user_prefs_logs (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL,
  ip text NOT NULL DEFAULT '',
  timezone text NOT NULL DEFAULT '',
  follow_domains text[] NOT NULL DEFAULT '{}'::text[],
  reminder_mode text NOT NULL DEFAULT '',
  reminder_dnd boolean NOT NULL DEFAULT false,
  reminder_interval_minutes int NOT NULL DEFAULT 0,
  reminder_window_start_hour int NOT NULL DEFAULT 0,
  reminder_window_end_hour int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.user_prefs_logs IS
  '用户点击保存时记录的偏好快照，用于统计与回溯。';

CREATE INDEX IF NOT EXISTS user_prefs_logs_created_at_idx
  ON public.user_prefs_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS user_prefs_logs_user_id_idx
  ON public.user_prefs_logs (user_id, created_at DESC);

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

COMMENT ON TABLE public.article_user_state IS
  '按用户与文章维度的交互状态：赞/踩/已读，且每种动作只记一次。';

CREATE INDEX IF NOT EXISTS article_user_state_updated_at_idx
  ON public.article_user_state (updated_at DESC);

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

COMMENT ON TABLE public.article_action_events IS
  '用户交互事件流水，用于统计与审计（不做去重）。';

CREATE INDEX IF NOT EXISTS article_action_events_created_at_idx
  ON public.article_action_events (created_at DESC);

CREATE INDEX IF NOT EXISTS article_action_events_user_id_idx
  ON public.article_action_events (user_id, created_at DESC);

ALTER TABLE public.anon_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_prefs_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.article_user_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.article_action_events ENABLE ROW LEVEL SECURITY;
