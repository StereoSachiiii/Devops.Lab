#!/usr/bin/env bash
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "================================================================="
echo "   DevOps Platform Application Rollback Engine"
echo "================================================================="

COMPOSE_FILE="$SCRIPT_DIR/docker-compose.prod.yml"
ENV_FILE="$ROOT_DIR/.env.prod"

if [ ! -f "$ENV_FILE" ]; then
  echo "❌ Error: $ENV_FILE not found."
  exit 1
fi

SERVICE_NAME=$1
PREVIOUS_TAG=$2

usage() {
  echo "Usage: ./deploy/rollback.sh <service-name> <previous-image-or-tag>"
  echo "Example: ./deploy/rollback.sh core-service 1.0.4"
  echo "Example: ./deploy/rollback.sh web-frontend devops/web-frontend:sha-abc1234"
  echo ""
  echo "Allowed rollback services: auth-service, core-service, notification-service, sandbox-router, sandbox-worker, web-frontend, api-gateway"
  exit 1
}

if [ -z "$SERVICE_NAME" ] || [ -z "$PREVIOUS_TAG" ]; then
  usage
fi

# ─────────────────────────────────────────────────────────────────────────────
# SAFETY GATE: Reject State / Tier 0 rollback attempts
# ─────────────────────────────────────────────────────────────────────────────
case "$SERVICE_NAME" in
  postgres|redis|rabbitmq|redpanda|db-migrate|redpanda-init)
    echo "🚨 REFUSING ROLLBACK:"
    echo "   Service '$SERVICE_NAME' is stateful infrastructure or a migration job."
    echo "   App-code rollbacks MUST NEVER automatically roll back database state or schema."
    echo "   If a schema rollback is required, an explicit down-migration script must be run manually."
    exit 1
    ;;
  auth-service)
    ENV_VAR_NAME="AUTH_SERVICE_IMAGE"
    DEFAULT_BASE="devops/auth-service"
    ;;
  core-service)
    ENV_VAR_NAME="CORE_SERVICE_IMAGE"
    DEFAULT_BASE="devops/core-service"
    ;;
  notification-service)
    ENV_VAR_NAME="NOTIFICATION_SERVICE_IMAGE"
    DEFAULT_BASE="devops/notification-service"
    ;;
  sandbox-router)
    ENV_VAR_NAME="SANDBOX_ROUTER_IMAGE"
    DEFAULT_BASE="devops/sandbox-router"
    ;;
  sandbox-worker)
    ENV_VAR_NAME="SANDBOX_WORKER_IMAGE"
    DEFAULT_BASE="devops/sandbox-worker"
    ;;
  web-frontend)
    ENV_VAR_NAME="WEB_FRONTEND_IMAGE"
    DEFAULT_BASE="devops/web-frontend"
    ;;
  api-gateway)
    echo "ℹ️ Gateway rollback: Restarting api-gateway..."
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" restart api-gateway
    exit 0
    ;;
  *)
    echo "❌ Error: Unrecognized service '$SERVICE_NAME'."
    usage
    ;;
esac

# Normalize target image name
if [[ "$PREVIOUS_TAG" == *":"* ]]; then
  TARGET_IMAGE="$PREVIOUS_TAG"
else
  TARGET_IMAGE="${DEFAULT_BASE}:${PREVIOUS_TAG}"
fi

echo "🔄 Initiating rollback for '$SERVICE_NAME' to image: $TARGET_IMAGE"

export ${ENV_VAR_NAME}="$TARGET_IMAGE"

echo "🚀 Deploying rolled-back container..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --no-deps "$SERVICE_NAME"

echo "⏳ Waiting for '$SERVICE_NAME' to pass healthcheck..."
timeout=60
elapsed=0
while [ $elapsed -lt $timeout ]; do
  status=$(docker inspect --format='{{json .State.Health.Status}}' "$SERVICE_NAME" 2>/dev/null || echo '"unknown"')
  if [ "$status" == '"healthy"' ]; then
    echo "✅ Rollback SUCCESS: '$SERVICE_NAME' is HEALTHY on image $TARGET_IMAGE."
    exit 0
  fi
  sleep 2
  elapsed=$((elapsed + 2))
done

echo "❌ Error: Rolled back container '$SERVICE_NAME' failed healthcheck within ${timeout}s (Status: $status)."
docker logs --tail 50 "$SERVICE_NAME"
exit 1
