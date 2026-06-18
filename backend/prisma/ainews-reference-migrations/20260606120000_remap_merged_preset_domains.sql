-- 合并内置领域 id：digital→tech，film→entertainment（客户端 LEGACY_PRESET_MAP 同步）

UPDATE public.articles a
SET domains = mapped.new_domains
FROM (
  SELECT
    id,
    ARRAY(
      SELECT DISTINCT
        CASE
          WHEN x = 'digital' THEN 'tech'
          WHEN x = 'film' THEN 'entertainment'
          ELSE x
        END
      FROM unnest(domains) AS x
    ) AS new_domains
  FROM public.articles
  WHERE domains && ARRAY['digital', 'film']::text[]
) mapped
WHERE a.id = mapped.id
  AND a.domains IS DISTINCT FROM mapped.new_domains;

UPDATE public.anon_users au
SET follow_domains = mapped.new_domains
FROM (
  SELECT
    id,
    ARRAY(
      SELECT DISTINCT
        CASE
          WHEN x = 'digital' THEN 'tech'
          WHEN x = 'film' THEN 'entertainment'
          ELSE x
        END
      FROM unnest(follow_domains) AS x
    ) AS new_domains
  FROM public.anon_users
  WHERE follow_domains && ARRAY['digital', 'film']::text[]
) mapped
WHERE au.id = mapped.id
  AND au.follow_domains IS DISTINCT FROM mapped.new_domains;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'user_extension_preferences'
  ) THEN
    UPDATE public.user_extension_preferences uep
    SET industry_ids = mapped.new_domains
    FROM (
      SELECT
        user_id,
        ARRAY(
          SELECT DISTINCT
            CASE
              WHEN x = 'digital' THEN 'tech'
              WHEN x = 'film' THEN 'entertainment'
              ELSE x
            END
          FROM unnest(industry_ids) AS x
        ) AS new_domains
      FROM public.user_extension_preferences
      WHERE industry_ids && ARRAY['digital', 'film']::text[]
    ) mapped
    WHERE uep.user_id = mapped.user_id
      AND uep.industry_ids IS DISTINCT FROM mapped.new_domains;
  END IF;
END $$;
