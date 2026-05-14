-- 将 name = ClearBG.ai 的应用 slug 改为 clearbg（与 APP_SLUG 对齐）。
-- 若 slug = clearbg 已被其它行占用，本语句会因 UNIQUE 约束失败，需先手动处理冲突。
UPDATE application
SET
  slug = 'clearbg',
  updated_at = NOW()
WHERE name = 'ClearBG.ai';
