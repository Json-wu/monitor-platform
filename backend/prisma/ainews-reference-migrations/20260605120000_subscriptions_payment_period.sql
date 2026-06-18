-- subscriptions：记录最近支付时间与当前周期起止

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS last_paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS current_period_start timestamptz,
  ADD COLUMN IF NOT EXISTS recurrence text,
  ADD COLUMN IF NOT EXISTS raw_payload jsonb;

ALTER TABLE public.pending_subscriptions
  ADD COLUMN IF NOT EXISTS last_paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS current_period_start timestamptz,
  ADD COLUMN IF NOT EXISTS recurrence text;

COMMENT ON COLUMN public.subscriptions.last_paid_at IS
  '最近一次成功支付时间（Gumroad sale_timestamp）';
COMMENT ON COLUMN public.subscriptions.current_period_start IS
  '当前订阅周期开始时间（通常为最近一次支付时间）';
COMMENT ON COLUMN public.subscriptions.current_period_end IS
  '当前订阅周期到期时间；取消/退款时为权益终止时间';
COMMENT ON COLUMN public.subscriptions.recurrence IS
  'Gumroad 计费周期：monthly / quarterly / yearly 等';
COMMENT ON COLUMN public.subscriptions.raw_payload IS
  '最近一次 Gumroad Ping 原始字段（调试与对账）';

COMMENT ON COLUMN public.pending_subscriptions.last_paid_at IS
  '最近一次成功支付时间（Gumroad sale_timestamp）';
COMMENT ON COLUMN public.pending_subscriptions.current_period_start IS
  '当前订阅周期开始时间';
COMMENT ON COLUMN public.pending_subscriptions.recurrence IS
  'Gumroad 计费周期';
