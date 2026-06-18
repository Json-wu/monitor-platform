-- Merge plugin Gumroad table public.subscriptions into platform public.subscription.

DO $$
DECLARE
  app_uuid UUID;
BEGIN
  IF to_regclass('public.subscriptions') IS NULL THEN
    RETURN;
  END IF;

  SELECT id INTO app_uuid FROM application WHERE slug = 'chrome-ainews' LIMIT 1;
  IF app_uuid IS NULL THEN
    RAISE NOTICE 'chrome-ainews not found; skip subscriptions merge';
    RETURN;
  END IF;

  INSERT INTO subscription (
    id, app_id, user_id, plan_id, status, gateway_sub_id,
    current_period_start, current_period_end, created_at, updated_at
  )
  SELECT
    gen_random_uuid(),
    app_uuid,
    s.end_user_id,
    pp.id,
    CASE
      WHEN s.status IN ('active') THEN 'active'::"SubStatus"
      WHEN s.status IN ('expired') THEN 'expired'::"SubStatus"
      WHEN s.status IN ('past_due') THEN 'past_due'::"SubStatus"
      ELSE 'cancelled'::"SubStatus"
    END,
    NULLIF(trim(s.gumroad_subscription_id), ''),
    COALESCE(s.current_period_start, s.last_paid_at, s.created_at, now()),
    COALESCE(
      s.current_period_end,
      s.current_period_start + interval '1 month',
      s.last_paid_at + interval '1 month',
      now() + interval '1 month'
    ),
    COALESCE(s.created_at, now()),
    COALESCE(s.updated_at, now())
  FROM subscriptions s
  JOIN LATERAL (
    SELECT p.id
    FROM pricing_plan p
    WHERE p.app_id = app_uuid
      AND p.is_active = true
      AND (
        (s.plan = 'pro' AND (p.slug = 'pro' OR p.slug ILIKE '%pro%' OR COALESCE(p.payment_link, '') ILIKE '%industry-ai-news-pro%'))
        OR (s.plan = 'unlimited' AND (p.slug = 'unlimited' OR p.slug ILIKE '%unlimited%' OR COALESCE(p.payment_link, '') ILIKE '%industry-ai-news-unlimited%'))
      )
    ORDER BY p.sort_order ASC
    LIMIT 1
  ) pp ON true
  WHERE NOT EXISTS (
    SELECT 1 FROM subscription sub
    WHERE sub.app_id = app_uuid AND sub.user_id = s.end_user_id
  );

  UPDATE subscription sub
  SET
    plan_id = pp.id,
    status = CASE
      WHEN s.status IN ('active') THEN 'active'::"SubStatus"
      WHEN s.status IN ('expired') THEN 'expired'::"SubStatus"
      WHEN s.status IN ('past_due') THEN 'past_due'::"SubStatus"
      ELSE 'cancelled'::"SubStatus"
    END,
    gateway_sub_id = COALESCE(NULLIF(trim(s.gumroad_subscription_id), ''), sub.gateway_sub_id),
    current_period_start = COALESCE(s.current_period_start, s.last_paid_at, sub.current_period_start),
    current_period_end = COALESCE(s.current_period_end, sub.current_period_end),
    updated_at = now()
  FROM subscriptions s
  JOIN LATERAL (
    SELECT p.id
    FROM pricing_plan p
    WHERE p.app_id = app_uuid
      AND p.is_active = true
      AND (
        (s.plan = 'pro' AND (p.slug = 'pro' OR p.slug ILIKE '%pro%' OR COALESCE(p.payment_link, '') ILIKE '%industry-ai-news-pro%'))
        OR (s.plan = 'unlimited' AND (p.slug = 'unlimited' OR p.slug ILIKE '%unlimited%' OR COALESCE(p.payment_link, '') ILIKE '%industry-ai-news-unlimited%'))
      )
    ORDER BY p.sort_order ASC
    LIMIT 1
  ) pp ON true
  WHERE sub.app_id = app_uuid
    AND sub.user_id = s.end_user_id;

  DROP TABLE IF EXISTS public.subscriptions;
END $$;
