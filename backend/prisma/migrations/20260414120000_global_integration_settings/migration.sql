ALTER TABLE "end_user" DROP COLUMN IF EXISTS "api_key_first_seen_at";
-- 全站集成：按 name 分多行（linkmePay / removeBackground / smtp）
CREATE TABLE "global_integration_setting" (
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "global_integration_setting_pkey" PRIMARY KEY ("name")
);

-- 优先旧版单表 global_integration_settings(id=1)；否则取 application（clearbg 优先）；再拆成三行
DO $$
DECLARE
    merged jsonb := '{}'::jsonb;
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'global_integration_settings'
    ) THEN
        SELECT COALESCE(g.settings, '{}'::jsonb)
        INTO merged
        FROM "global_integration_settings" AS g
        WHERE g.id = 1
        LIMIT 1;
    END IF;

    IF merged = '{}'::jsonb THEN
        SELECT COALESCE(a.settings, '{}'::jsonb)
        INTO merged
        FROM "application" AS a
        ORDER BY CASE WHEN a.slug = 'clearbg' THEN 0 ELSE 1 END, a.created_at ASC
        LIMIT 1;
    END IF;

    INSERT INTO "global_integration_setting" ("name", "config", "updated_at")
    VALUES
        (
            'linkmePay',
            COALESCE(merged -> 'integrations' -> 'linkmePay', '{}'::jsonb),
            CURRENT_TIMESTAMP
        ),
        (
            'removeBackground',
            COALESCE(merged -> 'removeBackgroundApi', '{}'::jsonb),
            CURRENT_TIMESTAMP
        ),
        (
            'smtp',
            COALESCE(merged -> 'smtp', '{}'::jsonb),
            CURRENT_TIMESTAMP
        );
END $$;

DROP TABLE IF EXISTS "global_integration_settings";
