-- 偏好日志：界面语言、主题、系统语言、来源（onboarding / settings）

ALTER TABLE public.user_prefs_logs
  ADD COLUMN IF NOT EXISTS ui_lang text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ui_theme text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS system_language text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT '';

COMMENT ON COLUMN public.user_prefs_logs.ui_lang IS '插件界面语言（UiLang）';
COMMENT ON COLUMN public.user_prefs_logs.ui_theme IS '主题偏好：system | light | dark';
COMMENT ON COLUMN public.user_prefs_logs.system_language IS '浏览器 / 系统 BCP-47 语言标签';
COMMENT ON COLUMN public.user_prefs_logs.source IS '记录来源：onboarding | settings 等';
