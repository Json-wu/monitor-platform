#!/usr/bin/env sh
# 在部署机上拉取 ACR 镜像并重启容器（供 GitHub Actions SSH 或人工调用）。
# 用法（在 deploy/server 目录，已配置 .env）：
#   sh deploy.sh              # 更新 frontend + backend
#   sh deploy.sh backend      # 仅后端
#   sh deploy.sh frontend     # 仅前端
#   sh deploy.sh backend frontend
#
# 可选环境变量：
#   ACR_USERNAME / ACR_PASSWORD / ACR_REGISTRY — 若设置则先 docker login
#   COMPOSE_PROFILES — 例如 db（同机 Postgres 时）
set -eu

ROOT="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
cd "$ROOT"

SERVICES="${*:-backend frontend}"
SERVICES="$(echo "$SERVICES" | xargs)"
if [ -z "$SERVICES" ]; then
  SERVICES="backend frontend"
fi

if [ -n "${ACR_USERNAME:-}" ] && [ -n "${ACR_PASSWORD:-}" ] && [ -n "${ACR_REGISTRY:-}" ]; then
  HOST="${ACR_REGISTRY%%/*}"
  echo "==> docker login $HOST"
  echo "$ACR_PASSWORD" | docker login "$HOST" -u "$ACR_USERNAME" --password-stdin
fi

echo "==> docker compose pull $SERVICES"
# shellcheck disable=SC2086
docker compose pull $SERVICES

echo "==> docker compose up -d --remove-orphans $SERVICES"
# shellcheck disable=SC2086
docker compose up -d --remove-orphans $SERVICES

echo "==> prune dangling images"
docker image prune -f >/dev/null 2>&1 || true

echo "==> status"
docker compose ps
echo "Deploy done: $SERVICES"
