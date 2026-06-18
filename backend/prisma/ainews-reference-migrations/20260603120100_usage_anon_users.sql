-- 允许按 anon_users.id 记录 Free 档每日摘要用量（无 auth.users FK）

ALTER TABLE public.user_llm_usage_daily
  DROP CONSTRAINT IF EXISTS user_llm_usage_daily_user_id_fkey;

COMMENT ON TABLE public.user_llm_usage_daily IS
  '每日 LLM 摘要调用次数；user_id 为 auth.users.id 或 anon_users.id。';
