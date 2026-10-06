#!/bin/bash
set -e

RECREATE=false
if [ "$1" == "--recreate" ]; then
    RECREATE=true
fi

echo "============================================================"
echo "🚀 Deploying DevOps.lab Dev Environment to KinD..."
echo "============================================================"

if [ "$RECREATE" = true ]; then
    echo ""
    echo "📦 Recreating KinD Cluster (devops-dev)..."
    kind delete cluster --name devops-dev 2>/dev/null || true
    kind create cluster --config deploy/kind-dev-cluster.yaml --name devops-dev
fi

echo ""
echo "Applying Kubernetes Manifests (01 to 09)..."
kubectl apply -f deploy/k8s/dev/01-namespace.yaml
kubectl apply -f deploy/k8s/dev/02-config.yaml

if [ -f ".env" ]; then
    echo "🔐 Injecting local secrets from uncommitted .env into devops-secrets..."
    SECRET_ARGS=()
    while IFS='=' read -r key val || [ -n "$key" ]; do
        [[ "$key" =~ ^#.*$ ]] && continue
        [[ -z "$key" ]] && continue
        val=$(echo "$val" | tr -d '"' | tr -d "'")
        case "$key" in
            GOOGLE_CLIENT_ID|GOOGLE_CLIENT_SECRET|GITHUB_CLIENT_ID|GITHUB_CLIENT_SECRET|GEMINI_API_KEY|ENCRYPTION_KEY|RESEND_API_KEY)
                SECRET_ARGS+=("--from-literal=$key=$val")
                ;;
        esac
    done < .env
    if [ ${#SECRET_ARGS[@]} -gt 0 ]; then
        kubectl create secret generic devops-secrets -n devops-dev "${SECRET_ARGS[@]}" --dry-run=client -o yaml | kubectl apply -f -
    fi
fi

kubectl apply -f deploy/k8s/dev/03-tier0-data.yaml
kubectl apply -f deploy/k8s/dev/04-tier1-init.yaml
kubectl apply -f deploy/k8s/dev/05-tier2-microservices.yaml
kubectl apply -f deploy/k8s/dev/06-sandbox-worker.yaml
kubectl apply -f deploy/k8s/dev/07-tier3-edge.yaml
kubectl apply -f deploy/k8s/dev/08-observability.yaml
kubectl apply -f deploy/k8s/dev/09-admin.yaml

echo ""
echo "⏳ Waiting for Citus Sharding & DB Migration Jobs to Complete..."
kubectl wait --for=condition=complete job/citus-shard-init -n devops-dev --timeout=120s
kubectl wait --for=condition=complete job/redpanda-topic-init -n devops-dev --timeout=120s
kubectl wait --for=condition=complete job/db-migrate -n devops-dev --timeout=180s

echo ""
echo "⏳ Waiting for Core Deployments & Sandbox Services to become Ready..."
kubectl rollout status deployment/api-gateway -n devops-dev --timeout=120s
kubectl rollout status deployment/auth-service -n devops-dev --timeout=120s
kubectl rollout status deployment/core-service -n devops-dev --timeout=120s
kubectl rollout status deployment/sandbox-router -n devops-dev --timeout=120s
kubectl rollout status statefulset/sandbox-worker -n devops-dev --timeout=120s
kubectl rollout status deployment/web-frontend -n devops-dev --timeout=120s
kubectl rollout status deployment/admin-frontend -n devops-dev --timeout=120s
kubectl rollout status deployment/prometheus -n devops-dev --timeout=120s
kubectl rollout status deployment/grafana -n devops-dev --timeout=120s

echo ""
echo "============================================================"
echo "✅ All DevOps.lab Dev Services are UP and HEALTHY!"
echo "  - API Gateway:    http://localhost:8005"
echo "  - Web Frontend:   http://localhost:3000"
echo "  - Admin Portal:   http://localhost:3001"
echo "  - Grafana:        http://localhost:3005"
echo "  - Prometheus:     http://localhost:9090"
echo "============================================================"


