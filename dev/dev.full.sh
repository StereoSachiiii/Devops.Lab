#!/usr/bin/env bash
set -eo pipefail

# =============================================================================
# DevOps Platform - Full Development Environment (Brokers + Observability)
# =============================================================================
# Layers Redpanda (Kafka), RabbitMQ, and the full telemetry stack (Loki,
# Tempo, Prometheus, Grafana, Otel-Collector) on top of the base dev stack
# using the exact same Compose project name (devops-dev).
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "🚀 Starting Full Dev Infrastructure (Base + Brokers + Observability)..."
docker compose -p devops-dev -f "$SCRIPT_DIR/docker-compose.dev.yml" -f "$SCRIPT_DIR/docker-compose.full.yml" up -d

echo "⏳ Waiting for core infrastructure health..."
until [ "$(docker inspect --format='{{json .State.Health.Status}}' devops-postgres-dev 2>/dev/null)" == '"healthy"' ]; do sleep 1; done
until [ "$(docker inspect --format='{{json .State.Health.Status}}' devops-redis-dev 2>/dev/null)" == '"healthy"' ]; do sleep 1; done
until [ "$(docker inspect --format='{{json .State.Health.Status}}' devops-rabbitmq-dev 2>/dev/null)" == '"healthy"' ]; do sleep 1; done
until [ "$(docker inspect --format='{{json .State.Health.Status}}' devops-redpanda-dev 2>/dev/null)" == '"healthy"' ]; do sleep 1; done

# Verify redpanda-init completion
echo "⏳ Verifying Kafka topic initialization (redpanda-init)..."
init_timeout=30
init_elapsed=0
while [ $init_elapsed -lt $init_timeout ]; do
  running=$(docker inspect --format='{{.State.Running}}' devops-redpanda-init-dev 2>/dev/null || echo "false")
  if [ "$running" == "false" ]; then
    exit_code=$(docker inspect --format='{{.State.ExitCode}}' devops-redpanda-init-dev 2>/dev/null || echo "1")
    if [ "$exit_code" == "0" ]; then
      echo "✅ Kafka topics successfully provisioned (redpanda-init exited 0)."
      break
    else
      echo "❌ Error: 'redpanda-init' failed with exit code $exit_code."
      docker logs devops-redpanda-init-dev
      exit 1
    fi
  fi
  sleep 1
  init_elapsed=$((init_elapsed + 1))
done

if [ $init_elapsed -ge $init_timeout ]; then
  echo "❌ Error: 'redpanda-init' timed out after ${init_timeout}s."
  docker logs devops-redpanda-init-dev
  exit 1
fi

echo "✅ All infrastructure healthy and ready."
echo "   PostgreSQL: 127.0.0.1:5444"
echo "   Redis: 127.0.0.1:6379"
echo "   RabbitMQ UI: http://localhost:15672"
echo "   Grafana: http://localhost:3001"
echo "   Redpanda Console: http://localhost:18080"

cd "$ROOT_DIR"
npm run build:packages

echo "⚡ Starting host-native microservices..."
npx concurrently -n "web,auth,core,notification" -c "blue,green,yellow,magenta" \
  "npm run dev --workspace=apps/web" \
  "npm run dev --workspace=services/auth" \
  "npm run dev --workspace=services/core" \
  "npm run dev --workspace=services/notification"
