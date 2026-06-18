-- 后台 RSS 入库：按 canonical_url 去重，domains 记录所属内置领域
CREATE TABLE IF NOT EXISTS public.articles (
  id bigserial PRIMARY KEY,
  canonical_url text NOT NULL UNIQUE,
  source_url text NOT NULL,
  title text NOT NULL,
  published_at timestamptz NOT NULL,
  source text NOT NULL DEFAULT '',
  domains text[] NOT NULL DEFAULT '{}',
  raw_summary text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS articles_published_at_idx
  ON public.articles (published_at DESC);

CREATE INDEX IF NOT EXISTS articles_domains_gin_idx
  ON public.articles USING gin (domains);

COMMENT ON TABLE public.articles IS
  'Edge ingest-rss 每分钟抓取的白名单 RSS 条目；客户端经 list-news 读取。';

ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;
