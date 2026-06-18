-- RSS 入库时解析的原站缩略图 URL（可选）
ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS image_url text;

COMMENT ON COLUMN public.articles.image_url IS
  'ingest-rss 从 RSS media:thumbnail、enclosure 或正文 img 解析的图片 URL';
