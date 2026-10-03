# Local Development Guide

Detailed reference for the local development setup, all workflow modes, port allocations, memory profiles, Windows/WSL2 specifics, and troubleshooting.

---

## 1. Architecture Principle

To prevent Docker Desktop OOM crashes, local development runs databases in lightweight containers while running application services directly on the host with hot reload. Only Postgres and Redis run in Docker by default.

### Memory Footprint Comparison

| Component | Full Docker Compose | Default Dev (`npm run dev`) |
| :--- | :--- | :--- |
| **PostgreSQL** | ~80 MB | ~80 MB *(Limit: 256MB)* |
| **Redis** | ~25 MB | ~25 MB *(Limit: 128MB)* |
| **Redpanda (Kafka)** | **1,536 MB** | **0 MB** *(Off by default)* |
| **RabbitMQ** | **512 MB** | **0 MB** *(Off by default)* |
| **Kong API Gateway** | **350 MB** | **0 MB** *(Direct localhost ports)* |
| **Observability** *(Loki, Tempo, Prometheus, Grafana, OTel)* | **~1,880 MB** | **0 MB** *(Off by default)* |
| **Total Docker RAM** | **~4,383 MB (~4.4 GB)** 🚨 | **~105 MB (< 0.15 GB)** ⚡ |

---

## 2. Development Workflows

### Default Daily Development — `npm run dev`

**Script:** `dev/dev.sh`

**What it starts:**
- **Docker:** PostgreSQL (port `5444`) and Redis (port `6379`)
- **Host-native:** `web` (Next.js Turbopack), `auth-service`, `core-service`, `notification-service` — all with hot reload (`tsx watch`)

**When to use:** Everyday full-stack coding — UI work, auth flows, challenge/content editing, unit testing.

**What's excluded (and why):**
- **Kong Gateway** — Services communicate directly via `localhost` ports. No gateway overhead.
- **Kafka/RabbitMQ** — Not needed for standard REST development. Outbox events are written to DB but won't be consumed.
- **Observability stack** — Logs go to stdout and `logs/` directory. No Grafana dashboards.

```bash
npm run dev
```

**Startup sequence:**
1. `docker compose -p devops-dev` starts Postgres + Redis
2. Waits for both containers to report `healthy`
3. Runs `npm run build:packages` (compiles `@devops/observability` and `@devops/messaging`)
4. Launches 4 services via `concurrently` with color-coded output

---

### Sandbox Development — `npm run dev:sandbox`

**Script:** `dev/dev.sandbox.sh`

**What it adds:** The Go `sandbox-worker` daemon connected to the host Docker socket (`/var/run/docker.sock`).

**When to use:** Developing or debugging the sandbox container lifecycle — provisioning, WebSocket terminal sessions, validator execution.

**Prerequisites:**
- Go 1.22+ installed
- Docker socket accessible (see [WSL2 Docker Socket](#wsl2-docker-socket-permissions) section)

```bash
npm run dev:sandbox
```

---

### Full Distributed Stack — `npm run dev:full`

**Script:** `dev/dev.full.sh`

**What it adds** (additive overlay on top of default dev):
- **Redpanda** (Kafka-compatible) + topic initialization
- **RabbitMQ** + management UI
- **Prometheus**, **Loki**, **Tempo**, **Grafana**, **OTel Collector**

**When to use:** Testing async Kafka event flows, RabbitMQ queue processing, viewing distributed traces in Tempo, or inspecting Grafana dashboards.

**Docker Compose files used:**
1. `dev/docker-compose.dev.yml` (base: Postgres + Redis)
2. `dev/docker-compose.full.yml` (overlay: brokers + observability)

```bash
npm run dev:full
```

---

## 3. Port Allocations

### Application Services (Host-Native)

| Service | URL | Notes |
| :--- | :--- | :--- |
| **Web Frontend** | `http://localhost:3000` | Next.js with Turbopack hot reload |
| **Auth Service** | `http://localhost:3002` | tsx watch, Prometheus metrics at `/metrics` |
| **Core Service** | `http://localhost:3003` | tsx watch |
| **Notification Service** | `http://localhost:3004` | tsx watch |
| **Sandbox Worker** | `http://localhost:8090` | Go binary (only when `dev:sandbox` active) |

### Infrastructure (Docker)

| Infrastructure | Port | Notes |
| :--- | :--- | :--- |
| **PostgreSQL** | `127.0.0.1:5444` | Non-standard port to avoid conflicts with system Postgres |
| **Redis** | `127.0.0.1:6379` | Standard Redis port |

### Full Stack Only (Active when `dev:full`)

| Infrastructure | Port | Notes |
| :--- | :--- | :--- |
| **Kong API Gateway** | `http://localhost:8005` | Proxy port; admin on `8001` |
| **RabbitMQ Management** | `http://localhost:15672` | User: `guest`, Pass: `guest` |
| **Grafana** | `http://localhost:3001` | Dashboards for metrics, logs, traces |
| **Prometheus** | `http://localhost:9090` | Metrics query UI |
| **Redpanda Console** | `http://localhost:18080` | Kafka topic browser |
| **Loki** | `http://localhost:3100` | Log aggregation (internal) |
| **Tempo** | `http://localhost:3200` | Distributed tracing (internal) |
| **OTel Collector (HTTP)** | `http://localhost:4318` | OpenTelemetry OTLP receiver |
| **OTel Collector (gRPC)** | `localhost:4317` | OpenTelemetry OTLP receiver |

---

## 4. Windows / WSL2 Specifics

### Docker Backend Requirement

The dev scripts use `wsl docker compose` to run containers. Docker Desktop must have the WSL2 backend enabled:

1. Docker Desktop → Settings → General → **Use the WSL 2 based engine** ✅
2. Docker Desktop → Settings → Resources → WSL Integration → Enable for your default distro

### WSL2 Docker Socket Permissions

The sandbox worker needs access to `/var/run/docker.sock` to provision containers:

```powershell
# Verify from PowerShell
wsl ls -la /var/run/docker.sock
# Should show: srw-rw---- 1 root docker ...

# If your WSL user isn't in the docker group:
wsl sudo usermod -aG docker $USER
# Then restart WSL: wsl --shutdown
```

### File Watching Performance

WSL2 has a known issue with inotify file watching across the Windows ↔ Linux filesystem boundary. For best hot-reload performance:

- Clone the repo **inside WSL** (`/home/<user>/devops/`) rather than in `/mnt/c/`
- Or, if the repo is on the Windows filesystem, Next.js Turbopack and `tsx watch` use polling as a fallback, which works but is slower

### Line Endings

The repo includes a `.gitattributes` file. If you encounter `\r\n` issues:
```bash
git config core.autocrlf input
```

---

## 5. Stopping the Dev Stack

```bash
# Stop Docker containers only
npm run stop

# Kill all service processes + stop Docker + clear caches
npm run clean

# Kill only host-native service processes
npm run kill:services
```

---

## 6. Environment Variables

The root `.env` file is pre-populated with development defaults. You should **not** need to modify it for standard local development.

Key variables to be aware of:

| Variable | Default | Why It Matters |
| :--- | :--- | :--- |
| `DATABASE_URL` | `postgresql://postgres:postgres@127.0.0.1:5444/appdb` | Non-standard port `5444` |
| `REDIS_URL` | `redis://127.0.0.1:6379` | Standard Redis port |
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:8005` | Frontend→Gateway. In default dev mode (no Kong), the frontend calls services directly. |
| `CORS_ORIGIN` | `http://localhost:3000,http://127.0.0.1:3000` | Both localhost variants |
| `LOG_LEVEL` | `info` | Set to `debug` for verbose output |
| `OUTBOX_INTERVAL_MS` | `2000` | How often the outbox poller checks for unprocessed events |
| *(Sandbox Runtime)* | Dynamic | Dynamically selected per challenge (`docker`, `gvisor`, `kata`, `flintlock`) |

For a complete variable reference, see the [Onboarding Guide — Environment Variables](ONBOARDING.md#5-environment-variables-reference).

---

## 7. End-to-End Testing

The E2E test suite (`tests/e2e.test.ts`) tests full-stack flows through the Kong API Gateway, asserting on actual PostgreSQL rows, Redis denylist entries, and Prometheus metric scrapes.

### Prerequisites
The full stack must be running — E2E tests hit Kong on port `8005`:
```bash
npm run dev:full
```

### Running Tests
```bash
# Core E2E suite (8 scenarios)
npm run test:e2e

# Extended E2E suite
npm run test:e2e:extended

# All E2E tests
npm run test:e2e:all
```

### Test Coverage
- User registration + `AuthOutboxEvent` verification
- Login `Set-Cookie` header security assertions (`HttpOnly`, `SameSite`)
- Invalid login → Prometheus metric increment
- Challenge start → `CoreOutboxEvent` + `LabSession` creation
- Kong `/api/assistant` gateway routing
- Organization multi-tenancy empty state guards
- RBAC invite enforcement (MEMBER → 403)
- Token revocation + Redis JTI denylist verification

---

## 8. Useful Commands Reference

| Command | What It Does |
| :--- | :--- |
| `npm run dev` | Start lightweight dev (Postgres + Redis + 4 services) |
| `npm run dev:sandbox` | Add sandbox worker to dev stack |
| `npm run dev:full` | Full stack including brokers + observability |
| `npm run stop` | Stop Docker containers |
| `npm run clean` | Kill everything + clear caches |
| `npm run build:packages` | Compile shared `@devops/*` packages |
| `npm run db:generate` | Regenerate Prisma client |
| `npm run db:push` | Push Prisma schema to database |
| `npm run lint` | Lint all workspaces |
| `npm run format` | Fix formatting (Prettier) |
| `npm run format:check` | Check formatting without fixing |
| `npm run test:e2e` | Run E2E test suite |
| `npm run kill:services` | Kill only host-native processes |
