#!/usr/bin/env bash
set -eo pipefail

# =============================================================================
# DevOps Platform - Ultra-Lightweight Local Development Engine
# =============================================================================
# What this DELIBERATELY EXCLUDES from Docker:
# - Redpanda / Kafka (saves ~1.5GB RAM) - not needed for routine coding/UI work.
# - RabbitMQ (saves ~512MB RAM) - not needed for standard REST/page dev.
# - Kong API Gateway (saves ~350MB RAM) - apps communicate directly via localhost.
# - Full Observability Stack (Loki, Tempo, Prometheus, Grafana - saves ~2GB RAM).
#
# Total resting Docker RAM: ~105MB (Postgres + Redis).
#
# To start the full broker & observability stack, run: ./dev/dev.full.sh
# To start the sandbox execution worker, run: ./dev/dev.sandbox.sh
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "🚀 Starting lightweight development databases (Postgres + Redis: ~105MB RAM)..."
docker compose -p devops-dev -f "$SCRIPT_DIR/docker-compose.dev.yml" up -d

echo "⏳ Waiting for Postgres & Redis to report healthy..."
until [ "$(docker inspect --format='{{json .State.Health.Status}}' devops-postgres-dev 2>/dev/null)" == '"healthy"' ]; do
  sleep 1
done
until [ "$(docker inspect --format='{{json .State.Health.Status}}' devops-redis-dev 2>/dev/null)" == '"healthy"' ]; do
  sleep 1
done
echo "✅ Core dev databases healthy."

echo "📦 Ensuring internal packages are compiled..."
cd "$ROOT_DIR"
npm run build:packages

echo "⚡ Launching host-native microservices (Hot Reloading with tsx watch & Next.js Turbopack)..."
npx concurrently -n "web,auth,core,notification" -c "blue,green,yellow,magenta" \
  "npm run dev --workspace=apps/web" \
  "npm run dev --workspace=services/auth" \
  "npm run dev --workspace=services/core" \
  "npm run dev --workspace=services/notification"
