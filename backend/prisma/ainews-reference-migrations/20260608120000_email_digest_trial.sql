-- 非 Unlimited 用户：绑定邮箱后可体验一次邮件汇总日报

ALTER TABLE public.user_extension_preferences
  ADD COLUMN IF NOT EXISTS email_digest_trial_sent_at timestamptz;

COMMENT ON COLUMN public.user_extension_preferences.email_digest_trial_sent_at IS
  '非 Unlimited 用户的一次性邮件汇总体验发送时间；Unlimited 走每日 22:00 逻辑。';
