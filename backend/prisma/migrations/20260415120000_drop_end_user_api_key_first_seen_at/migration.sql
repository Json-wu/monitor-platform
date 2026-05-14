-- 与 schema.prisma 对齐：20260411160000 在 20260410180000 之后又加回了该列，此处链尾统一删除
ALTER TABLE "end_user" DROP COLUMN IF EXISTS "api_key_first_seen_at";
