#!/usr/bin/env bash
set -eo pipefail

echo "================================================================="
echo "   DevOps Platform Production Tiered Deployment Engine"
echo "================================================================="

COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.prod"

if [ ! -f "$ENV_FILE" ]; then
  echo "❌ Error: $ENV_FILE not found! Copy and populate before deploying."
  exit 1
fi

# Ensure external proxy network exists
docker network inspect global-proxy-net >/dev/null 2>&1 || {
  echo "🌐 Creating missing docker network 'global-proxy-net'..."
  docker network create global-proxy-net
}

wait_for_healthy() {
  local service=$1
  local timeout=${2:-60}
  local elapsed=0

  echo "⏳ Waiting for '$service' to report healthy (timeout: ${timeout}s)..."
  while [ $elapsed -lt $timeout ]; do
    local status
    status=$(docker inspect --format='{{json .State.Health.Status}}' "$service" 2>/dev/null || echo '"unknown"')
    
    if [ "$status" == '"healthy"' ]; then
      echo "✅ Service '$service' is HEALTHY."
      return 0
    fi

    sleep 2
    elapsed=$((elapsed + 2))
  done

  echo "❌ Error: Service '$service' failed to become healthy within ${timeout}s (Status: $status)."
  docker logs --tail 50 "$service"
  exit 1
}

# ─────────────────────────────────────────────────────────────────────────────
# TIER 0: Core Infrastructure & Observability (Parallel)
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "🚀 [Tier 0] Starting Core Infrastructure (postgres, redis, rabbitmq, redpanda)..."
docker compose -f $COMPOSE_FILE --env-file $ENV_FILE up -d postgres redis rabbitmq redpanda

wait_for_healthy postgres 60
wait_for_healthy redis 60
wait_for_healthy rabbitmq 60
wait_for_healthy redpanda 60

# ─────────────────────────────────────────────────────────────────────────────
# TIER 1: Database Migrations & Topic Initialization (One-shot run)
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "🚀 [Tier 1] Executing Database Migrations & Redpanda Topics..."
docker compose -f $COMPOSE_FILE --env-file $ENV_FILE up db-migrate redpanda-init --exit-code-from db-migrate

echo "✅ Tier 1 Initialization complete."

# ─────────────────────────────────────────────────────────────────────────────
# TIER 2: Core Microservices & Workers (Parallel)
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "🚀 [Tier 2] Starting Microservices & Workers..."
docker compose -f $COMPOSE_FILE --env-file $ENV_FILE up -d auth-service core-service notification-service sandbox-router sandbox-worker

wait_for_healthy auth-service 60
wait_for_healthy core-service 60
wait_for_healthy notification-service 60
wait_for_healthy sandbox-router 60
wait_for_healthy sandbox-worker 60

# ─────────────────────────────────────────────────────────────────────────────
# TIER 3: Edge API Gateway (Kong)
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "🚀 [Tier 3] Starting Edge Gateway (api-gateway)..."
docker compose -f $COMPOSE_FILE --env-file $ENV_FILE up -d api-gateway

wait_for_healthy api-gateway 60

# ─────────────────────────────────────────────────────────────────────────────
# TIER 4: Client Web Application
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "🚀 [Tier 4] Starting Web Frontend (web-frontend)..."
docker compose -f $COMPOSE_FILE --env-file $ENV_FILE up -d web-frontend

wait_for_healthy web-frontend 60

echo ""
echo "================================================================="
echo "🎉 ALL TIERS DEPLOYED AND HEALTHY!"
echo "   Gateway: http://localhost:8005"
echo "   Frontend: http://localhost:3000"
echo "================================================================="
