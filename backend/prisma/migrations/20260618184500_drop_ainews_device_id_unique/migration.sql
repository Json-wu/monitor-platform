-- 同一物理设备可登录多个邮箱账号；device_id 仅作关联字段，不再全局唯一。

DROP INDEX IF EXISTS "end_user_app_id_ainews_device_id_unique_idx";

CREATE INDEX IF NOT EXISTS "end_user_app_id_ainews_device_id_idx"
  ON "end_user"("app_id", "ainews_device_id")
  WHERE "ainews_device_id" <> '';
