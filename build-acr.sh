#!/usr/bin/env sh
# Convenience wrapper: sh build-acr.sh frontend|backend|all [--no-push] [--no-login]
exec sh "$(dirname "$0")/scripts/build-push.sh" "$@"
