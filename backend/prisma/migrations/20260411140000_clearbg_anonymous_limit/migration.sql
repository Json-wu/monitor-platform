-- AlterTable
ALTER TABLE "end_user" ADD COLUMN "end_user_api_key" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "end_user_end_user_api_key_key" ON "end_user"("end_user_api_key");

-- CreateTable
CREATE TABLE "clearbg_anonymous_daily_usage" (
    "id" UUID NOT NULL,
    "app_id" UUID NOT NULL,
    "ip" TEXT NOT NULL,
    "day_utc" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clearbg_anonymous_daily_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clearbg_anonymous_daily_usage_app_id_ip_day_utc_key" ON "clearbg_anonymous_daily_usage"("app_id", "ip", "day_utc");

-- CreateIndex
CREATE INDEX "clearbg_anonymous_daily_usage_app_id_day_utc_idx" ON "clearbg_anonymous_daily_usage"("app_id", "day_utc");

-- AddForeignKey
ALTER TABLE "clearbg_anonymous_daily_usage" ADD CONSTRAINT "clearbg_anonymous_daily_usage_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill end_user_api_key for existing rows (one-time)
UPDATE "end_user"
SET "end_user_api_key" = 'eu_' || replace(gen_random_uuid()::text, '-', '')
WHERE "end_user_api_key" IS NULL;
