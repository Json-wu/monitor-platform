-- CreateTable
CREATE TABLE "kling_image_anonymous_daily_usage" (
    "id" UUID NOT NULL,
    "app_id" UUID NOT NULL,
    "ip" TEXT NOT NULL,
    "day_utc" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kling_image_anonymous_daily_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "kling_image_anonymous_daily_usage_app_id_ip_day_utc_key" ON "kling_image_anonymous_daily_usage"("app_id", "ip", "day_utc");

-- CreateIndex
CREATE INDEX "kling_image_anonymous_daily_usage_app_id_day_utc_idx" ON "kling_image_anonymous_daily_usage"("app_id", "day_utc");

-- AddForeignKey
ALTER TABLE "kling_image_anonymous_daily_usage" ADD CONSTRAINT "kling_image_anonymous_daily_usage_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
