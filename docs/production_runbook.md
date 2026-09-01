# Production Deployment & Operations Runbook

## 1. Architecture Tiers & Startup Sequence

```
Tier 0 (Parallel Infra)      →  postgres (5432), redis (6379), rabbitmq (5672), redpanda (9092)
                                 ↳ Observability stack runs in parallel (loki, tempo, prometheus, grafana)
Tier 1 (One-Shot Provision)  →  db-migrate (prisma migrate deploy), redpanda-init (topic creation)
Tier 2 (Parallel Apps)       →  auth-service (3002), core-service (3003), notification-service (3004),
                                 sandbox-router (8080), sandbox-worker (8090)
Tier 3 (Edge Gateway)        →  api-gateway (Kong :8000 -> :8005)
Tier 4 (Presentation)        →  web-frontend (Next.js :3000)
```

---

## 2. Standard Deployment Procedure

### Prerequisites
1. Ensure `.env.prod` is present in the repository root (based on template `.env.prod`, never committed).
2. Docker engine with Docker Compose v2+ installed.

### Automated Deployment
Run the automated tiered deployment script:
```bash
./deploy.sh
```

`deploy.sh` executes the following steps and halts immediately on any error:
1. Validates `.env.prod` and creates `global-proxy-net` if missing.
2. Spawns **Tier 0** (`postgres`, `redis`, `rabbitmq`, `redpanda`) in daemon mode.
3. Polls Docker container health status until all 4 core infra services report `healthy`.
4. Runs **Tier 1** (`db-migrate` and `redpanda-init`) and verifies `db-migrate` exits with code `0`.
5. Starts **Tier 2** (`auth-service`, `core-service`, `notification-service`, `sandbox-router`, `sandbox-worker`).
6. Polls and verifies all microservices pass `/health` checks.
7. Starts **Tier 3** (`api-gateway`) and verifies Kong health.
8. Starts **Tier 4** (`web-frontend`) and verifies `/api/health` returns `200 OK`.

---

## 3. Rollback Procedure

App-level code rollbacks replace individual container images using `rollback.sh` without touching database state or schema.

### Reverting an Application Service
To roll back a specific service (e.g. `core-service` or `web-frontend`) to a previous container tag:
```bash
# Revert core-service
./rollback.sh core-service v1.0.4

# Revert web-frontend
./rollback.sh web-frontend devops/web-frontend:sha-abc1234
```

### Rollback Guarantees:
* **No Tier 0 Impact**: `rollback.sh` explicitly rejects attempts to target `postgres`, `redis`, `rabbitmq`, or `redpanda`.
* **No Backward Schema Drift**: Database schemas are forward-only; rolling back application code does not alter PostgreSQL tables.
* **Isolated Replacement**: Uses `docker compose up -d --no-deps <service>` to swap only the targeted container.
* **Healthcheck Gate**: Waits up to 60s for the rolled back container to report `healthy`. If it fails, previous logs are outputted and exit code `1` is returned.

---

## 4. Verification & Smoke Testing Commands

After deployment or rollback, execute the smoke tests:

### 1. Health Endpoints
```bash
# Auth Service Health
curl -s -f http://localhost:8005/api/auth/health || curl -s -f http://127.0.0.1:3002/health

# Core Service Health
curl -s -f http://127.0.0.1:3003/health

# Sandbox Router Health
curl -s -f http://127.0.0.1:8080/health

# Web Frontend Health
curl -s -f http://localhost:3000/api/health
```

### 2. End-to-End Business Smoke Tests
* **Auth**: `POST http://localhost:8005/api/auth/register` with test email payload.
* **Core**: `GET http://localhost:8005/api/challenges` (returns 200 with catalog).
* **Assistant**: `POST http://localhost:8005/api/assistant/chat` (verifies Kong route).
