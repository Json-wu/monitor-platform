-- 定价页文案从 application.settings.pricingPage 迁至独立列 pricing_page
ALTER TABLE "application" ADD COLUMN "pricing_page" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "application" ADD COLUMN "google_client_id" TEXT;

UPDATE "application"
SET "pricing_page" = CASE
  WHEN jsonb_typeof(COALESCE("settings", '{}'::jsonb) -> 'pricingPage') = 'object'
  THEN COALESCE("settings", '{}'::jsonb) -> 'pricingPage'
  ELSE '{}'::jsonb
END;

ALTER TABLE "application" DROP COLUMN "settings";
