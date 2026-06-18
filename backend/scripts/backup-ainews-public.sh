#!/usr/bin/env bash
# 从 Supabase（或任意 Postgres）导出 Industry AI News public 表数据到本地 SQL 文件。
#
# 用法（推荐 Direct connection :5432，不要用 Transaction pooler :6543）：
#   SUPABASE_DB_URL='postgresql://postgres:密码@db.qmpkgdlpirzknotugqep.supabase.co:5432/postgres' \
#     npm run db:backup:ainews
#
#   SUPABASE_DB_URL='...' npm run db:backup:ainews -- /path/to/custom.sql
#
# 密码含 @ # 等须 URL 编码（@ → %40）。URI 从 Supabase Dashboard → Database → Connection string 复制。

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/backups/ainews-public-$(date +%Y%m%d-%H%M%S).sql}"

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "错误: 请设置 SUPABASE_DB_URL"
  echo "推荐 Direct connection（Dashboard → Database → Direct connection，端口 5432）："
  echo "  SUPABASE_DB_URL='postgresql://postgres:pass%40word@db.qmpkgdlpirzknotugqep.supabase.co:5432/postgres' npm run db:backup:ainews"
  exit 1
fi

if [[ "$SUPABASE_DB_URL" == *":6543/"* ]] || [[ "$SUPABASE_DB_URL" == *":6543?"* ]]; then
  echo "⚠️  警告: 端口 6543 为 Transaction pooler，pg_dump 可能被断开。请改用 Direct connection (:5432)。"
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "错误: 未找到 pg_dump，请安装 PostgreSQL 客户端（如 brew install libpq）"
  exit 1
fi

mkdir -p "$(dirname "$OUT")"

TABLES=(
  articles
  article_summary_cache
  anon_users
  user_prefs_logs
  article_user_state
  article_action_events
  pending_subscriptions
  subscriptions
  user_extension_preferences
  email_digest_briefs
  user_llm_usage_daily
  edge_job_locks
)

TABLE_ARGS=()
for t in "${TABLES[@]}"; do
  TABLE_ARGS+=(--table="public.${t}")
done

echo "导出到: $OUT"
pg_dump "$SUPABASE_DB_URL" \
  --data-only \
  --schema=public \
  --no-owner \
  --no-privileges \
  --inserts \
  "${TABLE_ARGS[@]}" \
  -f "$OUT"

echo "完成: $(wc -c < "$OUT" | tr -d ' ') 字节"
echo "导入本地 monitor: npm run db:migrate:ainews:from-dump -- $OUT"
