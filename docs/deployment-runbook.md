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

## 2. Secrets & Configuration (`.env.prod`)

> [!CAUTION]
> **NEVER COMMIT `.env.prod` TO SOURCE CONTROL.**
> Ensure `.env.prod` is present in the repository root and listed in `.gitignore`.

### Required Production Environment Variables
Before running the first deployment, populate `.env.prod` with the following variables:

#### Core Infrastructure & Databases
* `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`
* `DATABASE_URL` (Full connection string including password and `?schema=public`)
* `REDIS_URL`, `RABBITMQ_URL`

#### Message Brokers (Redpanda / Kafka)
* `KAFKA_BROKERS`, `KAFKA_CLIENT_ID`, `KAFKA_GROUP_ID`, `KAFKA_ADVERTISED_HOST`

#### Cryptography & Authentication Secrets
* `JWT_PRIVATE_KEY` (RSA 2048-bit PKCS#8 private key for signing auth tokens)
* `JWT_PUBLIC_KEY` (RSA 2048-bit public key for verification in core & sandbox services)
* `ENCRYPTION_KEY` (32-byte Base64 AES key for sandbox state encryption)

#### Third-Party API Credentials
* `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
* `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`
* `GEMINI_API_KEY`
* `RESEND_API_KEY`

#### Security & Monitoring
* `GF_SECURITY_ADMIN_PASSWORD` (Grafana admin password)
* `CORS_ORIGIN`, `ALLOWED_ORIGINS`, `DOMAIN`

---

## 3. Automated Deployment Procedure

To deploy the full tiered platform:
```bash
./deploy.sh
```

### What `deploy.sh` Does (Step-by-Step with Health Gating)
1. **Tier 0**: Launches `postgres`, `redis`, `rabbitmq`, `redpanda` in parallel.
   * *Healthchecks*:
     * Postgres: `pg_isready -U postgres -d appdb`
     * Redis: `redis-cli ping`
     * RabbitMQ: `rabbitmq-diagnostics -q ping`
     * Redpanda: `rpk cluster info`
   * *Timeout*: Waits up to 60s per service. Exits immediately if any container fails to report `healthy`.
2. **Tier 1**: Runs `db-migrate` (`npx prisma migrate deploy`) and `redpanda-init` (Kafka topic creation).
   * *Exit Code Gate*: Blocks until migrations complete; terminates deployment if `db-migrate` exits with non-zero code.
3. **Tier 2**: Starts `auth-service`, `core-service`, `notification-service`, `sandbox-router`, and `sandbox-worker` in parallel.
   * *Healthchecks*:
     * Auth: `GET http://127.0.0.1:3002/health` → 200 OK
     * Core: `GET http://127.0.0.1:3003/health` → 200 OK
     * Notification: `GET http://127.0.0.1:3004/health` → 200 OK
     * Sandbox Router: `GET http://127.0.0.1:8080/health` → 200 OK
     * Sandbox Worker: `GET http://127.0.0.1:8090/health` → 200 OK
4. **Tier 3**: Starts `api-gateway` (Kong) and waits for `kong health` probe.
5. **Tier 4**: Starts `web-frontend` and verifies `GET http://127.0.0.1:3000/api/health` returns 200.

---

## 4. Application Rollback Procedure

To roll back a specific application service without touching database state or schema:

```bash
# Roll back core-service to previous version
./rollback.sh core-service v1.0.4

# Roll back web-frontend to previous image SHA
./rollback.sh web-frontend devops/web-frontend:sha-abc1234
```

### Safety Guarantees in `rollback.sh`:
* **Rejection of Tier 0**: Refuses execution if called on `postgres`, `redis`, `rabbitmq`, `redpanda`, or `db-migrate`.
* **Forward-Only Schema**: Application rollbacks do not roll back database tables.
* **Isolated Re-creation**: Uses `docker compose up -d --no-deps <service>` to swap only the targeted container.
* **Health Verification**: Verifies the replaced container reports `healthy` within 60s.

---

## 5. Post-Deployment Smoke Test Suite

Run the automated smoke test script:
```bash
./smoke-tests.sh
```

### Validations Performed:
* Kong Gateway status probe
* Web Frontend `/api/health` route
* Core Service challenge catalog routing (`GET /api/challenges` through Kong)
* Auth Service CORS and options routing (`OPTIONS /api/auth` through Kong)
* Assistant AI routing (`/api/assistant` confirmed mapped in Kong)
