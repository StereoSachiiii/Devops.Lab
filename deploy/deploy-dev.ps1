param(
    [switch]$RecreateCluster = $false
)

$ErrorActionPreference = "Stop"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "🚀 Deploying DevOps.lab Dev Environment to KinD..." -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

if ($RecreateCluster) {
    Write-Host "`n📦 Recreating KinD Cluster (devops-dev)..." -ForegroundColor Yellow
    kind delete cluster --name devops-dev 2>$null
    kind create cluster --config deploy/kind-dev-cluster.yaml --name devops-dev
}

Write-Host "`nApplying Kubernetes Manifests 01 to 09..." -ForegroundColor Yellow
kubectl apply -f deploy/k8s/dev/01-namespace.yaml
kubectl apply -f deploy/k8s/dev/02-config.yaml

if (Test-Path ".env") {
    Write-Host "🔐 Injecting local secrets from uncommitted .env into devops-secrets..." -ForegroundColor Cyan
    $envLines = Get-Content ".env" | Where-Object { $_ -match "^[A-Za-z_][A-Za-z0-9_]*=" }
    $secretArgs = @()
    foreach ($line in $envLines) {
        $idx = $line.IndexOf("=")
        $key = $line.Substring(0, $idx).Trim()
        $val = $line.Substring($idx + 1).Trim().Trim('"')
        if ($key -in @("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET", "GEMINI_API_KEY", "ENCRYPTION_KEY", "RESEND_API_KEY")) {
            $secretArgs += "--from-literal=$key=$val"
        }
    }
    if ($secretArgs.Count -gt 0) {
        kubectl create secret generic devops-secrets -n devops-dev @secretArgs --dry-run=client -o yaml | kubectl apply -f -
    }
}

kubectl apply -f deploy/k8s/dev/03-tier0-data.yaml
kubectl apply -f deploy/k8s/dev/04-tier1-init.yaml
kubectl apply -f deploy/k8s/dev/05-tier2-microservices.yaml
kubectl apply -f deploy/k8s/dev/06-sandbox-worker.yaml
kubectl apply -f deploy/k8s/dev/07-tier3-edge.yaml
kubectl apply -f deploy/k8s/dev/08-observability.yaml
kubectl apply -f deploy/k8s/dev/09-admin.yaml

Write-Host "`n⏳ Waiting for Citus Sharding & DB Migration Jobs to Complete..." -ForegroundColor Yellow
kubectl wait --for=condition=complete job/citus-shard-init -n devops-dev --timeout=120s
kubectl wait --for=condition=complete job/redpanda-topic-init -n devops-dev --timeout=120s
kubectl wait --for=condition=complete job/db-migrate -n devops-dev --timeout=180s

Write-Host "`n⏳ Waiting for Core Deployments & Sandbox Services to become Ready..." -ForegroundColor Yellow
kubectl rollout status deployment/api-gateway -n devops-dev --timeout=120s
kubectl rollout status deployment/auth-service -n devops-dev --timeout=120s
kubectl rollout status deployment/core-service -n devops-dev --timeout=120s
kubectl rollout status deployment/sandbox-router -n devops-dev --timeout=120s
kubectl rollout status statefulset/sandbox-worker -n devops-dev --timeout=120s
kubectl rollout status deployment/web-frontend -n devops-dev --timeout=120s
kubectl rollout status deployment/admin-frontend -n devops-dev --timeout=120s
kubectl rollout status deployment/prometheus -n devops-dev --timeout=120s
kubectl rollout status deployment/grafana -n devops-dev --timeout=120s

Write-Host "`n============================================================" -ForegroundColor Green
Write-Host "✅ All DevOps.lab Dev Services are UP and HEALTHY!" -ForegroundColor Green
Write-Host "  - API Gateway:    http://localhost:8005" -ForegroundColor Green
Write-Host "  - Web Frontend:   http://localhost:3000" -ForegroundColor Green
Write-Host "  - Admin Portal:   http://localhost:3001" -ForegroundColor Green
Write-Host "  - Grafana:        http://localhost:3005" -ForegroundColor Green
Write-Host "  - Prometheus:     http://localhost:9090" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green

