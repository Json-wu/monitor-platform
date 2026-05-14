#!/usr/bin/env bash
# Build Docker images for Monitor admin frontend/backend and push to Alibaba Cloud ACR.
# Usage:
#   sh scripts/build-push.sh frontend|backend|all [--no-push] [--no-login]
# Env: deploy/acr.env (override with ENV_FILE=/path/to/env)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ENV_FILE="${ENV_FILE:-$ROOT/deploy/acr.env}"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

DO_PUSH=1
DO_LOGIN=1
TARGET=""
for arg in "$@"; do
  case "$arg" in
    --no-push) DO_PUSH=0 ;;
    --no-login) DO_LOGIN=0 ;;
    frontend|backend|all) TARGET="$arg" ;;
    -h|--help)
      echo "Usage: sh scripts/build-push.sh <frontend|backend|all> [--no-push] [--no-login]"
      echo ""
      echo "Copy deploy/acr.env.example to deploy/acr.env and set ACR_REGISTRY, IMAGE_TAG, etc."
      echo "Optional: ACR_USERNAME + ACR_PASSWORD for docker login before push."
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$TARGET" ]]; then
  echo "Usage: sh scripts/build-push.sh <frontend|backend|all> [--no-push] [--no-login]" >&2
  exit 1
fi

ACR_REGISTRY="${ACR_REGISTRY:-}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
FRONTEND_IMAGE_NAME="${FRONTEND_IMAGE_NAME:-monitor-admin-frontend}"
BACKEND_IMAGE_NAME="${BACKEND_IMAGE_NAME:-monitor-admin-backend}"
NEXT_PUBLIC_API_BASE_URL="${NEXT_PUBLIC_API_BASE_URL:-http://127.0.0.1:4010}"

if [[ -z "$ACR_REGISTRY" ]]; then
  echo "ACR_REGISTRY is not set. Copy deploy/acr.env.example to deploy/acr.env and set ACR_REGISTRY." >&2
  exit 1
fi

acr_login() {
  if [[ "$DO_LOGIN" != 1 ]]; then
    return 0
  fi
  if [[ -z "${ACR_USERNAME:-}" ]] || [[ -z "${ACR_PASSWORD:-}" ]]; then
    return 0
  fi
  local host
  host="${ACR_REGISTRY%%/*}"
  echo "Logging in to ${host} ..."
  printf '%s' "$ACR_PASSWORD" | docker login --username "$ACR_USERNAME" --password-stdin "$host"
}

build_frontend() {
  local tag="${ACR_REGISTRY}/${FRONTEND_IMAGE_NAME}:${IMAGE_TAG}"
  echo "Building frontend -> ${tag}"
  docker build \
    -f "$ROOT/frontend/Dockerfile" \
    --build-arg "NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}" \
    -t "$tag" \
    "$ROOT/frontend"
}

build_backend() {
  local tag="${ACR_REGISTRY}/${BACKEND_IMAGE_NAME}:${IMAGE_TAG}"
  echo "Building backend -> ${tag}"
  docker build \
    -f "$ROOT/backend/Dockerfile" \
    -t "$tag" \
    "$ROOT/backend"
}

push_tag() {
  local tag="$1"
  if [[ "$DO_PUSH" != 1 ]]; then
    echo "Skip push: $tag"
    return 0
  fi
  echo "Pushing ${tag}"
  docker push "$tag"
}

if [[ "$DO_PUSH" == 1 ]]; then
  acr_login
fi

case "$TARGET" in
  frontend)
    build_frontend
    push_tag "${ACR_REGISTRY}/${FRONTEND_IMAGE_NAME}:${IMAGE_TAG}"
    ;;
  backend)
    build_backend
    push_tag "${ACR_REGISTRY}/${BACKEND_IMAGE_NAME}:${IMAGE_TAG}"
    ;;
  all)
    build_frontend
    build_backend
    push_tag "${ACR_REGISTRY}/${FRONTEND_IMAGE_NAME}:${IMAGE_TAG}"
    push_tag "${ACR_REGISTRY}/${BACKEND_IMAGE_NAME}:${IMAGE_TAG}"
    ;;
esac

echo "Done."
