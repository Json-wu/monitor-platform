-- 摘要按语言分桶：同一 URL 可有 zh / en 等不同语言的摘要行
ALTER TABLE public.article_summary_cache
  ADD COLUMN IF NOT EXISTS locale text NOT NULL DEFAULT 'zh';

ALTER TABLE public.article_summary_cache DROP CONSTRAINT IF EXISTS article_summary_cache_pkey;

ALTER TABLE public.article_summary_cache ADD PRIMARY KEY (url, locale);

COMMENT ON COLUMN public.article_summary_cache.locale IS
  '摘要语言：与客户端浏览器语言归一化一致（如 zh、en）。';
