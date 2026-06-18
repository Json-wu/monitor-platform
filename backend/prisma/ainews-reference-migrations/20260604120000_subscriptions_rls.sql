-- subscriptions / pending_subscriptions：对 PostgREST 启用 RLS（消除 Security Advisor 告警）
-- 写入仅 Edge（service_role）；pending 不对客户端开放。

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_subscriptions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.subscriptions IS
  '已登录用户的 Gumroad 订阅；plan=pro|unlimited，status=active|cancelled|expired|refunded。RLS：用户仅可读本人行；写仅 service_role。';

COMMENT ON TABLE public.pending_subscriptions IS
  'Gumroad Webhook 先到、用户尚未登录时按买家邮箱暂存；登录后合并进 subscriptions。RLS：无客户端策略，仅 service_role。';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'subscriptions'
      AND policyname = 'subscriptions_select_own'
  ) THEN
    CREATE POLICY subscriptions_select_own
      ON public.subscriptions
      FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;
