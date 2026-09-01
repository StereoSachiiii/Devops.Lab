# DevOps.Lab Platform Production Operations Runbook

This document serves as the authoritative production operational guide for orchestrating, deploying, maintaining, and scaling the **DevOps.Lab** platform.

---

## 1. System Architecture & Topology Overview

```
                          [ Internet / Enterprise IdP / Users ]
                                            │
                                  HTTPS :443 / WSS :443
                                            ▼
                           ┌─────────────────────────────────┐
                           │   Kong API Gateway (:8005)      │
                           │  - Rate Limiting (Redis DB 1)   │
                           │  - CORS & Prometheus Exporter   │
                           └────────────────┬────────────────┘
                                            │
     ┌──────────────────────┬───────────────┴──────────────┬──────────────────────┐
     │                      │                              │                      │
     ▼                      ▼                              ▼                      ▼
┌──────────────┐    ┌──────────────┐               ┌──────────────┐       ┌──────────────┐
│  Web App     │    │ Auth Service │               │ Core Service │       │ Sandbox Svc  │
│  (Next.js 16)│    │ (Fastify:3002│               │(Fastify:3003)│       │ (Go PTY:8080)│
│  Port: 3000  │    │  JWT/MFA/SSO)│               │  Progress/DAG│       │ gVisor runsc │
└──────────────┘    └──────┬───────┘               └──────┬───────┘       └──────┬───────┘
                           │                              │                      │
                           └──────────────┬───────────────┘                      │
                                          │                                      │
                ┌─────────────────────────┼────────────────────────┐             │
                ▼                         ▼                        ▼             ▼
       ┌─────────────────┐       ┌─────────────────┐      ┌─────────────────────────┐
       │   PostgreSQL    │       │   Redis 7.2     │      │   Apache Kafka /        │
       │   (Prisma DB)   │       │  (Session Cache │      │   RabbitMQ RPC Bus      │
       │   Port: 5444    │       │   & Revocation) │      │   Ports: 19092 / 5672   │
       └─────────────────┘       └─────────────────┘      └─────────────────────────┘
```

---

## 2. Environment Variables & Secret Configuration Matrix

All production secrets must be provisioned via secret managers (AWS Secrets Manager, HashiCorp Vault, or Kubernetes Secrets).

| Variable Name | Required Service(s) | Production Requirement / Description |
| :--- | :--- | :--- |
| `DATABASE_URL` | `auth`, `core`, `db` | Connection string pointing to high-availability PostgreSQL cluster (`pool_size=20`). |
| `JWT_PRIVATE_KEY` | `auth-service` | RSA 2048/4096-bit PEM private key for signing access tokens. |
| `JWT_PUBLIC_KEY` | `core`, `sandbox` | RSA PEM public key for stateless signature verification. |
| `ENCRYPTION_KEY` | `core`, `sandbox` | 32-byte base64-encoded AES-256 key for sensitive payload encryption. |
| `REDIS_URL` | `auth`, `core`, `kong` | Redis cluster URI for rate limiting, distributed locking, and denylists. |
| `KAFKA_BROKERS` | `core`, `notification` | Comma-separated list of Kafka broker endpoints (`broker1:9092,broker2:9092`). |
| `RABBITMQ_URL` | `core`, `sandbox` | AMQP URI for low-latency RPC and terminal multiplexing. |
| `SANDBOX_PROVIDER` | `sandbox-worker` | `docker` (local dev) or `flintlock` / `gvisor` (production hardened). |
| `GEMINI_API_KEY` | `core-service` | Google Gemini API key for AI assistant and scenario guidance. |

---

## 3. Docker Compose Production Deployment

For single-node or VM-based deployments (AWS EC2, GCP Compute Engine, Hetzner Bare Metal):

### 3.1 Launch Stack
```bash
# 1. Clone repository and set production environment
cp .env.production .env

# 2. Pull base images and run database migrations
npx prisma migrate deploy --schema=packages/db/prisma/schema.prisma

# 3. Build and launch all containerized services in detached mode
docker compose -f docker-compose.yml --profile full up -d --build

# 4. Verify running container health
docker compose ps
```

### 3.2 Health Check URLs
- **Kong Gateway**: `http://<HOST>:8005/api/health`
- **Auth Service**: `http://<HOST>:3002/health`
- **Core Service**: `http://<HOST>:3003/health`
- **Sandbox Worker**: `http://<HOST>:8080/health`
- **Prometheus Metrics**: `http://<HOST>:9090`
- **Grafana Dashboards**: `http://<HOST>:3001` (Default: `admin` / `admin`)

---

## 4. Kubernetes Helm Chart Deployment Blueprint

For high-availability container orchestration across multi-zone Kubernetes clusters (EKS, GKE, AKS).

### 4.1 Kubernetes Namespace & Secret Manifest (`k8s/secrets.yaml`)
```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: devopslab-prod
---
apiVersion: v1
kind: Secret
metadata:
  name: devopslab-secrets
  namespace: devopslab-prod
type: Opaque
data:
  DATABASE_URL: <BASE64_ENCODED_POSTGRES_URL>
  JWT_PRIVATE_KEY: <BASE64_ENCODED_PRIVATE_KEY>
  JWT_PUBLIC_KEY: <BASE64_ENCODED_PUBLIC_KEY>
  ENCRYPTION_KEY: <BASE64_ENCODED_AES_KEY>
  GEMINI_API_KEY: <BASE64_ENCODED_GEMINI_KEY>
```

### 4.2 Core Service Deployment Manifest (`k8s/core-deployment.yaml`)
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: core-service
  namespace: devopslab-prod
  labels:
    app: core-service
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app: core-service
  template:
    metadata:
      labels:
        app: core-service
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "3003"
        prometheus.io/path: "/metrics"
    spec:
      containers:
        - name: core-service
          image: ghcr.io/devops-lab/core-service:latest
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 3003
          envFrom:
            - secretRef:
                name: devopslab-secrets
          resources:
            requests:
              cpu: "250m"
              memory: "512Mi"
            limits:
              cpu: "1000m"
              memory: "1024Mi"
          livenessProbe:
            httpGet:
              path: /health
              port: 3003
            initialDelaySeconds: 15
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /health
              port: 3003
            initialDelaySeconds: 5
            periodSeconds: 5
```

---

## 5. Zero-Downtime Database Migration Runbook

Database schema migrations in production use Prisma Migrate with a 3-step zero-downtime deployment pattern (Expand → Migrate → Contract).

### Step 1: Pre-Migration Validation
```bash
# Verify connection to target production replica and leader
npx prisma migrate status --schema=packages/db/prisma/schema.prisma
```

### Step 2: Apply Non-Breaking Additive Migration
1. Apply additive schema alterations (e.g. adding nullable columns or new tables):
   ```bash
   npx prisma migrate deploy --schema=packages/db/prisma/schema.prisma
   ```
2. Roll out updated application deployments (`core-service`, `auth-service`).

### Step 3: Emergency Rollback Procedure
If a migration fails or causes unexpected query lock contention:
1. Revert application code deployment to previous stable tag:
   ```bash
   kubectl rollout undo deployment/core-service -n devopslab-prod
   ```
2. For schema rollbacks, execute the corresponding targeted down-migration SQL script generated in `packages/db/prisma/migrations/`.

---

## 6. Backup, Disaster Recovery & Outbox Maintenance

### 6.1 Automated Daily PostgreSQL Backup
```bash
#!/usr/bin/env bash
# S3 / GCS PostgreSQL Backup Cron Script
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="/var/backups/postgres"
mkdir -p "$BACKUP_DIR"

pg_dump -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -Fc | gzip > "$BACKUP_DIR/db_$TIMESTAMP.dump.gz"

# Push to encrypted S3 bucket
aws s3 cp "$BACKUP_DIR/db_$TIMESTAMP.dump.gz" "s3://devopslab-backups/postgres/db_$TIMESTAMP.dump.gz" --sse AES256

# Prune local backups older than 7 days
find "$BACKUP_DIR" -type f -name "*.dump.gz" -mtime +7 -exec rm {} +
```

### 6.2 Transactional Outbox Dead-Letter Queue (DLQ) Recovery
If outbox events reach `retryCount >= 5` (`failed: true`), inspect and re-process:
```sql
-- Query failed poisoned outbox events
SELECT id, "eventType", "retryCount", "createdAt", payload 
FROM "CoreOutboxEvent" 
WHERE failed = true 
ORDER BY "createdAt" DESC;

-- Retry failed events after resolving downstream network/broker partition:
UPDATE "CoreOutboxEvent" 
SET failed = false, "retryCount" = 0 
WHERE id = '<EVENT_ID>';
```

---

## 7. Incident Response Playbook & Runbooks

### Incident Severity Levels:
- **P1 (Critical Outage)**: Terminal sandboxes failing to boot, authentication down, or database lockups.
- **P2 (Degraded Performance)**: P99 API response time `> 500ms`, email notifications delayed.
- **P3 (Minor Issue)**: Non-blocking UI glitch, single-user leaderboard sync delay.

### Common Incident Procedures:

#### 1. Sandbox Orphan Container Cleanup
If sandbox containers remain allocated after unexpected worker termination:
```bash
# Query and reap orphaned Docker sandbox containers older than 2 hours
docker ps -q --filter "name=sandbox_" --filter "before=2h" | xargs -r docker rm -f
```

#### 2. Redis Cache Flush for Session Revocation Sync
```bash
# Clear denylist in case of sync discrepancy without flushing DB rate limits:
redis-cli -u "$REDIS_URL" --scan --pattern "auth:denylist:*" | xargs -r redis-cli -u "$REDIS_URL" del
```

#### 3. Real-Time Distributed Trace Inspection (OpenTelemetry & Tempo)
When diagnosing elevated error rates on route endpoints (`core.quiz_submit`, `core.share_create`):
1. Navigate to Grafana Tempo at `http://<GRAFANA_HOST>:3001/explore`.
2. Filter by `service.name = core-service` and `status.code = ERROR`.
3. Inspect the waterfall span breakdown to identify slow database queries or unhandled exceptions.
