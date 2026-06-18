-- 邮件简报：记录上次成功投递时间，便于 Edge 限流。
ALTER TABLE public.user_extension_preferences
  ADD COLUMN IF NOT EXISTS last_email_digest_at timestamptz;

COMMENT ON COLUMN public.user_extension_preferences.last_email_digest_at IS
  '上次成功发送行业资讯邮件简报的时间（UTC），由 send-news-email-digest Edge 更新。';
