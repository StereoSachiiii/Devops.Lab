# Local Development Guide

This guide details the local development setup, workflow options, memory profiles, and troubleshooting steps.

---

## 1. Overview & Architecture

To prevent Docker Desktop out-of-memory (OOM) crashes, local development runs databases in lightweight containers while running application services directly on the host machine.

### Memory Footprint Comparison

| Component | Full Docker Container Run | Lightweight Host-Native Dev (`dev.sh`) |
| :--- | :--- | :--- |
| **PostgreSQL** | ~80 MB | ~80 MB *(Limit: 256MB)* |
| **Redis** | ~25 MB | ~25 MB *(Limit: 128MB)* |
| **Redpanda (Kafka)** | **1,536 MB** | **0 MB** *(Off by default)* |
| **RabbitMQ** | **512 MB** | **0 MB** *(Off by default)* |
| **Kong API Gateway** | **350 MB** | **0 MB** *(Direct localhost ports)* |
| **Observability Cluster** *(Loki, Tempo, Prometheus, Grafana, Otel)* | **~1,880 MB** | **0 MB** *(Off by default)* |
| **Total Docker Resting RAM** | **~4,383 MB (~4.4 GB)** 🚨 | **~105 MB (< 0.15 GB)** ⚡ |

---

## 2. Development Workflows

### Default Daily Development (`dev.sh`)
* **What it runs**: `PostgreSQL` (port `5444`) and `Redis` (port `6379`) in Docker; `web`, `auth-service`, `core-service`, and `notification-service` on the host.
* **When to use**: Everyday full-stack coding, UI tweaks, auth flows, quiz/content editing, and unit testing.
* **Command**:
  ```bash
  npm run dev
  ```

---

### Opt-In Specialized Workflows (Pending Migration Approval)

#### 1. Sandbox Execution Mode (`dev.sandbox.sh`)
* **Purpose**: Running and debugging live terminal sandboxes.
* **Why it needs Docker**: Spawns ephemeral container sandboxes dynamically via `/var/run/docker.sock`.
* **Command**:
  ```bash
  npm run dev:sandbox
  ```

#### 2. Full Distributed & Observability Mode (`dev.full.sh`)
* **Purpose**: Testing asynchronous Kafka event processing, RabbitMQ queues, and inspecting distributed traces in Grafana/Tempo.
* **What it adds**: Runs an additive overlay (`dev/docker-compose.full.yml`) extending the base `devops-dev` Docker project with Redpanda, RabbitMQ, and the telemetry stack without duplicating PostgreSQL or Redis.
* **Command**:
  ```bash
  npm run dev:full
  ```

---

## 3. Port Allocations (Host-Native Dev)

| Service / Infrastructure | Local Port |
| :--- | :--- |
| **Web Frontend** | `http://localhost:3000` |
| **Auth Service** | `http://localhost:3002` |
| **Core Service** | `http://localhost:3003` |
| **Notification Service** | `http://localhost:3004` |
| **Sandbox Worker** | `http://localhost:8090` |
| **PostgreSQL** | `127.0.0.1:5444` |
| **Redis** | `127.0.0.1:6379` |
| **RabbitMQ Management** | `http://localhost:15672` *(when full stack active)* |
| **Grafana** | `http://localhost:3001` *(when full stack active)* |
| **Redpanda Console** | `http://localhost:18080` *(when full stack active)* |

---

## 4. End-to-End Testing Suite

The regression test suite (`tests/e2e.test.ts`) tests full stack flows directly through the Kong API Gateway, asserting on actual PostgreSQL rows, Redis denylist entries, and Prometheus metric scrapes.

### Running E2E Tests
Ensure the background stack is running via `npm run dev:full` (or `docker compose up` with `devops-dev`), then execute:
```bash
npm run test:e2e
```
* **Coverage**: User registration & `AuthOutboxEvent` creation, `Set-Cookie` header validation, invalid login metrics tracking, catalog browsing & `CoreOutboxEvent` generation, Kong `/api/assistant` gateway routing, Org multi-tenancy empty states, Org Member RBAC 403 enforcement, and token revocation on logout.
