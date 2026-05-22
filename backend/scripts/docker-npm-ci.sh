#!/bin/sh
# Docker 构建内安装依赖：规避 GHA/buildx 上 npm 全局 _cacache 的 ENOENT/rename 竞态
set -eu
omit_dev="${1:-}"

export NPM_CONFIG_CACHE="${NPM_CONFIG_CACHE:-/tmp/npm-cache}"
export npm_config_prefer_offline=true

rm -rf /tmp/npm-cache /root/.npm/_cacache 2>/dev/null || true
mkdir -p "$NPM_CONFIG_CACHE"

attempt=1
max=3
while [ "$attempt" -le "$max" ]; do
  if [ "$omit_dev" = "--omit=dev" ]; then
    npm ci --omit=dev --no-audit --no-fund && exit 0
  else
    npm ci --no-audit --no-fund && exit 0
  fi
  echo "npm ci failed (attempt $attempt/$max), clearing cache..."
  rm -rf /tmp/npm-cache /root/.npm
  mkdir -p "$NPM_CONFIG_CACHE"
  attempt=$((attempt + 1))
  sleep 3
done
exit 1
