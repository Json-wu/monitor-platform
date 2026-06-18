#!/usr/bin/env bash
# 使用 Supabase CLI 临时登录角色直连迁移（需在 industry-ai-news-plugin 目录 link 项目）
set -euo pipefail

PLUGIN_DIR="${PLUGIN_DIR:-$(cd "$(dirname "$0")/../../../industry-ai-news-plugin" && pwd)}"
BACKEND_DIR="$(cd "$(dirname "$0")/.." && pwd)"

read_supabase_env() {
  (cd "$PLUGIN_DIR" && npx supabase@2.98.0 db dump --linked --dry-run --data-only 2>/dev/null | grep '^export PG')
}

eval "$(read_supabase_env)"
export SUPABASE_DB_URL="postgresql://${PGUSER}:${PGPASSWORD}@${PGHOST}:${PGPORT}/${PGDATABASE}"

cd "$BACKEND_DIR"
node scripts/migrate-ainews-from-supabase.mjs
