-- Grant ops:view to super_admin so 运维监控 appears after migrate deploy
-- without requiring a manual seed re-run.
UPDATE "role"
SET "permissions" = jsonb_set(
  COALESCE("permissions", '{}'::jsonb),
  '{ops}',
  '["view"]'::jsonb,
  true
)
WHERE "name" = 'super_admin'
  AND (
    "permissions"->'ops' IS NULL
    OR NOT (("permissions"->'ops') ? 'view')
  );
