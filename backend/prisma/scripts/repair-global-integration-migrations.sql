-- 在本地 monitor 库执行（psql / TablePlus），用于修复：
--   - 已修改过 checksum 的 20260414120000_global_integration_settings
--   - 数据库里有记录但仓库中缺失的 20260415025628_20260414120000_global_integration_settings
--
-- 执行后，在 monitor/backend 目录运行：
--   npx prisma migrate dev

DELETE FROM "_prisma_migrations"
WHERE "migration_name" IN (
  '20260415025628_20260414120000_global_integration_settings',
  '20260414120000_global_integration_settings'
);

DROP TABLE IF EXISTS "global_integration_setting" CASCADE;
DROP TABLE IF EXISTS "global_integration_settings" CASCADE;
