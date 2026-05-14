-- Daily promo reset idempotency (UTC calendar day YYYY-MM-DD)
ALTER TABLE "credit_account" ADD COLUMN "last_daily_promo_reset_date" VARCHAR(10);

-- One subscription row per app + end user (for billing period / monthly expire job)
DELETE FROM "subscription" s
WHERE s.id IN (
  SELECT id
  FROM (
      SELECT id,
        ROW_NUMBER() OVER (PARTITION BY app_id, user_id ORDER BY created_at DESC) AS rn
      FROM "subscription"
    ) t
  WHERE t.rn > 1
);

CREATE UNIQUE INDEX "subscription_app_id_user_id_key" ON "subscription"("app_id", "user_id");
