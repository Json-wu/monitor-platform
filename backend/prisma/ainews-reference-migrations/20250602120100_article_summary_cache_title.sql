-- 摘要缓存同时存本地化标题与摘要
ALTER TABLE public.article_summary_cache
  ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT '';

COMMENT ON COLUMN public.article_summary_cache.title IS
  '该 locale 下的展示标题（可由 LLM 改写或翻译）。';
