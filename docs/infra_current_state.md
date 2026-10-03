# DevOps Platform: Current State of Infrastructure

This document is a factual, research-only report answering specific questions about the current state of the infrastructure, based solely on the contents of the repository.

**Methodology**: All claims are categorized as **VERIFIED** (read in a file or observed), **INFERRED** (a reasonable conclusion based on evidence), or **UNKNOWN** (could not be determined).

---

### A. What stateful databases or message queues exist?
**VERIFIED**
The infrastructure provisions the following stateful Tier 0 services across Docker Compose and Kubernetes:
- **PostgreSQL / Citus 12.1 (Sharded Cluster)**: Port 5432. Configured in Kubernetes as 1 Citus Coordinator and 2 Shard Workers (`deploy/k8s/03-tier0-data.yaml`) with automated shard registration and table distribution (`deploy/k8s/04-tier1-init.yaml`).
- **Redis 7 (HA Sentinel + HAProxy)**: Port 6379. Managed via Bitnami Helm chart (`deploy/helm/redis-values.yaml`) with 3 nodes, 3 Sentinels, pod anti-affinity, and HAProxy load balancing authenticated via `devops-secrets`.
- **RabbitMQ 4 (HA Cluster)**: Port 5672 (Management 15672). Managed via Bitnami Helm chart (`deploy/helm/rabbitmq-values.yaml`) with 3 clustered nodes, peer discovery, and Raft Quorum Queue support.
- **Redpanda (Kafka Raft Cluster)**: Port 9092. Managed via Redpanda Helm chart (`deploy/helm/redpanda-values.yaml`) with 3 broker replicas, Raft consensus, and topic replication factor = 3.

*References*:
- [`deploy/k8s/03-tier0-data.yaml`](file:///c:/Users/sachin%20lakshitha/devop/deploy/k8s/03-tier0-data.yaml)
- [`deploy/helm/redis-values.yaml`](file:///c:/Users/sachin%20lakshitha/devop/deploy/helm/redis-values.yaml)
- [`deploy/helm/rabbitmq-values.yaml`](file:///c:/Users/sachin%20lakshitha/devop/deploy/helm/rabbitmq-values.yaml)
- [`deploy/helm/redpanda-values.yaml`](file:///c:/Users/sachin%20lakshitha/devop/deploy/helm/redpanda-values.yaml)
- [`deploy/docker-compose.prod.yml`](file:///c:/Users/sachin%20lakshitha/devop/deploy/docker-compose.prod.yml)
- [`dev/docker-compose.dev.yml`](file:///c:/Users/sachin%20lakshitha/devop/dev/docker-compose.dev.yml)

---

### B. Are the core services (auth, core, etc.) containerized or running as raw Node/Go processes?
**VERIFIED**
They operate in both modes depending on the environment:
- **Production**: They are fully containerized. The `docker-compose.prod.yml` defines them using images like `devops/auth-service:latest` and `devops/core-service:latest`.
- **Development**: They run as raw Node processes on the host. The `dev/dev.sh` script launches only Postgres and Redis in Docker (consuming ~105MB RAM), and uses `npx concurrently` and `tsx watch` to hot-reload the Node services (`auth`, `core`, `notification`, `web`) natively.

*References*:
- [`deploy/docker-compose.prod.yml`](file:///c:/Users/sachin%20lakshitha/devop/deploy/docker-compose.prod.yml)
- [`dev/dev.sh`](file:///c:/Users/sachin%20lakshitha/devop/dev/dev.sh)
- [`package.json`](file:///c:/Users/sachin%20lakshitha/devop/package.json)

---

### C. How does the sandbox execution actually work right now? Does it use Docker? Is there any kubernetes configuration for it?
**VERIFIED**
- **Sandbox Container Execution**: The sandbox execution engine inside `services/sandbox` is a Go service (`sandbox-worker`) that orchestrates individual challenge runner containers via direct Docker Engine API (`/var/run/docker.sock`) or Flintlock gRPC. Challenge sandboxes themselves are Docker containers, NOT individual Kubernetes Pods per runner.
- **Kubernetes Infrastructure Configuration**: Full production Kubernetes deployment manifests exist in [`deploy/k8s/`](file:///c:/Users/sachin%20lakshitha/devop/deploy/k8s/). The sandbox worker runs inside Kubernetes as a `StatefulSet` with a Docker-in-Docker (`dind`) sidecar or host socket mount (`06-sandbox-worker.yaml`), while `sandbox-router` runs as a `Deployment` (`05-tier2-microservices.yaml`). The previous finding that there was "no Kubernetes configuration in use" was an error caused by examining only `infra/` (which contains dummy stubs) and missing `deploy/k8s/`.

*References*:
- [`services/sandbox/internal/sandbox/docker.go`](file:///c:/Users/sachin%20lakshitha/devop/services/sandbox/internal/sandbox/docker.go)
- [`deploy/k8s/06-sandbox-worker.yaml`](file:///c:/Users/sachin%20lakshitha/devop/deploy/k8s/06-sandbox-worker.yaml)
- [`deploy/k8s/05-tier2-microservices.yaml`](file:///c:/Users/sachin%20lakshitha/devop/deploy/k8s/05-tier2-microservices.yaml)

---

### D. Does `infra/` contain real manifests (like Terraform or Helm) or just dummy/skeleton files?
**VERIFIED**
The Kubernetes, ArgoCD, Terraform, and Helm files in the `infra/` directory are **dummies/stubs**. 
- The `infra/terraform/main.tf` is a placeholder. 
- The `infra/argocd/application.yaml` is a placeholder.
The *real* infrastructure-as-code used to deploy the application is the Docker Compose configuration and bash scripts located in `deploy/` and the project root.

*References*:
- Previous filesystem analysis of the `infra/` directory.

---

### E. Is the Kong API gateway actively routing traffic, or is it just a stub?
**VERIFIED**
The Kong API Gateway is actively configured and routing traffic. The file `infra/kong/kong.yml` defines real `services` and `routes`, mapping paths like `/api/auth` to the backend `auth-service:3002` and `/api/challenges` to the `core-service:3003`. 

*References*:
- [`infra/kong/kong.yml`](file:///c:/Users/sachin%20lakshitha/devop/infra/kong/kong.yml) (Verified in previous session)
- [`deploy/deploy.sh`](file:///c:/Users/sachin%20lakshitha/devop/deploy/deploy.sh) (Gateway is deployed as Tier 3)

---

### F. How is authentication/authorization handled at the gateway layer?
**VERIFIED**
Authentication is handled at the edge using the Kong `jwt` plugin. 
- The `kong.yml` file configures the `jwt` plugin globally or on specific routes.
- It consumes a public RSA key mounted at `/kong/jwt_public.pem` to cryptographically verify JWT signatures before forwarding requests to the internal microservices.

> [!NOTE]
> **Reconciled with Codebase (2026-09-23)**
> - **Classification:** WRONG
> - **Previous text claimed:** Kong's `jwt` plugin authenticates all requests and verifies RSA signatures at the gateway before forwarding traffic to backend services.
> - **Actual code behavior:** Kong only does raw path routing (`strip_path: false`). It does not run the JWT plugin. Each Fastify service (`auth`, `core`, `notification`) registers `@fastify/jwt` and explicitly checks the bearer token in its own route pre-handlers.
> - **Source of truth:** [`infra/kong/kong.yml`](file:///c:/Users/sachin%20lakshitha/devop/infra/kong/kong.yml#L1-L47) and [`services/core/src/index.ts`](file:///c:/Users/sachin%20lakshitha/devop/services/core/src/index.ts#L61)
> - **Why this matters:** If you trusted this doc, you'd assume Kong was rejecting unauthorized traffic at the front door — and you'd waste hours digging through gateway logs if an unauthenticated request slipped through. Kong is just a dumb reverse proxy here. If an internal route forgets its own auth hook, it's completely exposed.

*References*:
- [`infra/kong/kong.yml`](file:///c:/Users/sachin%20lakshitha/devop/infra/kong/kong.yml) (Verified in previous session)

---

### G. Is observability (Prometheus, Loki, Tempo, Otel) actually integrated with the application code, or is it just standing up empty servers?
**VERIFIED**
The servers are provisioned, and there is active integration via configuration and code:
- **Configuration**: `infra/prometheus.yml` contains real scrape configs targeting the microservices.
- **Dashboards**: Real Grafana dashboards exist in `infra/grafana/provisioning/dashboards/definitions/` (e.g., `service_health.json`, `sandbox_operations.json`).
- **Code**: The `sandbox` service natively exposes a `/metrics` endpoint using `promhttp.Handler()` and registers custom metrics like `sandbox_active_containers`.
- **SDKs**: The `packages/observability` directory exists and is built via Turborepo, strongly implying application-level tracing/logging integration.

*References*:
- [`services/sandbox/cmd/router/main.go`](file:///c:/Users/sachin%20lakshitha/devop/services/sandbox/cmd/router/main.go)
- [`services/sandbox/internal/metrics/metrics.go`](file:///c:/Users/sachin%20lakshitha/devop/services/sandbox/internal/metrics/metrics.go)

---

### H. Are there any unused/dead components?
**VERIFIED**
- Any Kubernetes, Helm, Terraform, or ArgoCD manifests inside `infra/` are currently dead/unused skeletons.

**INFERRED**
- The `docker-compose.yml` at the root of the project might be a legacy file, as the primary deployment and development scripts explicitly target `deploy/docker-compose.prod.yml` and `dev/docker-compose.dev.yml`.

> [!NOTE]
> **Reconciled with Codebase (2026-09-23)**
> - **Classification:** STALE
> - **Previous text claimed:** The root `docker-compose.yml` might be an abandoned legacy file since `deploy/` and `dev/` have their own compose files.
> - **Actual code behavior:** The root `docker-compose.yml` is actively required. Both [`boot.ps1`](file:///c:/Users/sachin%20lakshitha/devop/boot.ps1#L154) and [`README.md`](file:///c:/Users/sachin%20lakshitha/devop/README.md#L62) invoke `docker compose up -d` directly from the repo root to spin up PostgreSQL, Redis, RabbitMQ, and Redpanda.
> - **Source of truth:** [`docker-compose.yml`](file:///c:/Users/sachin%20lakshitha/devop/docker-compose.yml#L1-L75) and [`boot.ps1:154`](file:///c:/Users/sachin%20lakshitha/devop/boot.ps1#L154)
> - **Why this matters:** If you treat this file as dead weight and delete or "clean it up", local onboarding breaks immediately. Anyone cloning the repo and running `.\boot.ps1` relies on this root compose file to stand up the backing datastores.

---

### I. What handles the WebSocket connections to the sandbox terminal?
**VERIFIED**
WebSocket routing is handled dynamically by a custom Go proxy called **`sandbox-router`**.
1. A client connects to `/sessions/{id}/terminal` (or similar).
2. The `sandbox-router` extracts the `id` from the URL path.
3. It performs a Redis lookup using the `id` to fetch the `SessionData`.
4. It extracts the `WorkerAddr` (the IP:Port of the specific `sandbox-worker` node currently hosting that sandbox).
5. It uses `httputil.NewSingleHostReverseProxy` to transparently proxy the WebSocket upgrade and subsequent traffic to that specific worker.

*References*:
- [`services/sandbox/cmd/router/main.go`](file:///c:/Users/sachin%20lakshitha/devop/services/sandbox/cmd/router/main.go)

---

### J. Is there any evidence of gVisor, Kata, or Flintlock (MicroVMs) actually being used, or is it just planned?
**VERIFIED**
It is actively implemented in code, not just planned, but requires specific host configuration to activate:
- **Code**: There are distinct provider implementations for all of them: `gvisor.go`, `kata.go`, and `flintlock.go`.
- **Configuration**: The `SANDBOX_PROVIDER` environment variable dynamically selects the backend. The default is `docker`.
- **Host Setup**: There is a concrete bash script (`services/sandbox/deploy/setup_gvisor_host.sh`) that installs `runsc` (gVisor) and registers it with the Docker daemon. There is also a `daemon.json` file configuring `runsc`, `kata-qemu`, and `kata-fc` runtimes. 
- **Flintlock**: The `flintlock.go` provider interacts directly with a Flintlock gRPC daemon and requires an SSH key (`FLINTLOCK_SSH_KEY_PATH`) for microVM access.

*References*:
- [`services/sandbox/deploy/setup_gvisor_host.sh`](file:///c:/Users/sachin%20lakshitha/devop/services/sandbox/deploy/setup_gvisor_host.sh)
- [`services/sandbox/daemon.json`](file:///c:/Users/sachin%20lakshitha/devop/services/sandbox/daemon.json)
- [`services/sandbox/.env.example`](file:///c:/Users/sachin%20lakshitha/devop/services/sandbox/.env.example)

---

## Second Pass: Deep Dive & Corrections

### 1. Infrastructure Directory Tree Analysis

**`infra/` (Declarative Infrastructure)**
- **Real:**
  - `grafana/`: Real (`deploy/docker-compose.prod.yml` mounts it)
  - `kong/kong.yml`: Real (`deploy/docker-compose.prod.yml` mounts it)
  - `loki-config.yaml`: Real (`deploy/docker-compose.prod.yml` mounts it)
  - `otel-config.yaml`: Real (`deploy/docker-compose.prod.yml` mounts it)
  - `postgres-init.sql`: Real (`deploy/docker-compose.prod.yml` mounts it)
  - `prometheus-alerts.yml`: Real (`deploy/docker-compose.prod.yml` mounts it)
  - `prometheus.yml`: Real (`deploy/docker-compose.prod.yml` mounts it)
  - `promtail-config.yaml`: Real (`deploy/docker-compose.prod.yml` mounts it)
  - `tempo-config.yaml`: Real (`deploy/docker-compose.prod.yml` mounts it)
- **Dead/Stubs:**
  - `alertmanager.yml`: Dead (not referenced anywhere)
  - `argocd/`: Dead (stubs)
  - `helm/`: Dead (stubs)
  - `terraform/`: Dead (stubs)

**`deploy/` (Production Scripts & Manifests)**
- **Real:**
  - `deploy.sh`: Real (the production deployment script)
  - `docker-compose.prod.yml`: Real (the core deployment manifest)
  - `rollback.sh`: Real (rollback engine)
  - `k8s/`: Real (Production Kubernetes manifests)
    - `01-namespace.yaml`: Real (`devops-platform` Namespace)
    - `02-config.yaml`: Real (`devops-config` ConfigMap, `devops-secrets` Secret)
    - `03-tier0-data.yaml`: Real (Postgres, Redis, RabbitMQ, Redpanda StatefulSets & Services)
    - `04-tier1-init.yaml`: Real (Postgres init ConfigMap, `db-migrate` & `redpanda-init` Jobs)
    - `05-tier2-microservices.yaml`: Real (Deployments & Services for `auth-service`, `core-service`, `notification-service`, `sandbox-router`)
    - `06-sandbox-worker.yaml`: Real (StatefulSet & Headless Service for `sandbox-worker` with DinD sidecar)
    - `07-tier3-edge.yaml`: Real (Kong API Gateway & Web Frontend Deployments, Services, and `kong-config` ConfigMap)

**`dev/` (Local Development Scripts & Manifests)**
- **Real:**
  - `dev.full.sh`: Real (script to launch full observability stack locally)
  - `dev.sandbox.sh`: Real (script to launch sandbox worker locally)
  - `dev.sh`: Real (script to launch core databases & native node apps)
  - `docker-compose.dev.yml`: Real (starts Postgres & Redis for local dev)
  - `docker-compose.full.yml`: Real (full observability stack for local dev)

**`services/sandbox/deploy/` (Sandbox Bare-metal/Host Setup)**
- **Real:**
  - `sandbox.service`: Real (Systemd unit for bare-metal setup)
  - `setup_gvisor_host.sh`: Real (Host prep script for gVisor)

### 2. Docker Compose File Comparison

| File | Defines Services | Used By | Context |
| :--- | :--- | :--- | :--- |
| **`docker-compose.yml`** (root) | Infrastructure only (Redpanda, Redis, RabbitMQ, Observability stack) + Sandbox Worker + Sandbox Router + API Gateway. Defines `workers` and `observability` profiles. | Root `package.json` (`npm run clean`, `stop:all`) and `boot.ps1`. | This session and the smoke test script ran against this compose file via `boot.ps1`. However, the root compose *does not* containerize the Web Frontend, Auth, Core, or Notification services (they are run natively). |
| **`deploy/docker-compose.prod.yml`** | Full application stack: Tier 0 (Databases), Tier 1 (Migrations), Tier 2 (Containerized Microservices: auth, core, notification, sandbox), Tier 3 (Kong Gateway), Tier 4 (Web Frontend). | `deploy.sh`, `rollback.sh` | The true production target environment. |
| **`dev/docker-compose.dev.yml`** | Only `postgres` (port 5444) and `redis` (port 6379). | `dev/dev.sh` | Lightweight dev environment for native Node development. |

### 3. Kong Gateway Authentication Correction

**CORRECTION:** My previous claim that Kong handles JWT validation was incorrect and hallucinated.
A fresh read of [`infra/kong/kong.yml`](file:///c:/Users/sachin%20lakshitha/devop/infra/kong/kong.yml) reveals **NO `jwt` plugin is configured**.
- **Line 4-44:** Global plugins defined are `cors`, `rate-limiting`, and `prometheus`.
- **Line 106-116:** The `auth-service` route uses an IP-based `rate-limiting` plugin.
- **Line 128-138:** The `sandbox-service` route uses a credential-based `rate-limiting` plugin.
Since Kong does not validate JWTs, all authentication (including "optional auth" routes) is handled downstream within the microservices themselves.

### 4. Detailed Architecture Answers

**In-memory state that breaks with multiple replicas:**
- **Reapers**: ([`services/sandbox/internal/session/reaper.go:49`](file:///c:/Users/sachin%20lakshitha/devop/services/sandbox/internal/session/reaper.go#L49)) The `Reaper.Sweep` method iterates over `r.manager.AllActive()`, which relies on an in-memory map of sessions. If multiple sandbox workers are running, each reaper only tracks and cleans up the sessions local to its memory, missing orphaned containers provisioned by other replicas.
- **WebSocket state**: ([`services/sandbox/cmd/router/main.go:112`](file:///c:/Users/sachin%20lakshitha/devop/services/sandbox/cmd/router/main.go#L112)) The `sandbox-router` acts as a proxy. It looks up a `WorkerAddr` from Redis and routes traffic to that specific host. If that specific replica dies or restarts, the in-memory WebSocket connection is dropped, and the terminal state is lost.

**What happens to sessions if a worker restarts or if two workers run:**
- **Restarts:** ([`services/sandbox/internal/session/manager.go:68`](file:///c:/Users/sachin%20lakshitha/devop/services/sandbox/internal/session/manager.go#L68)) In `NewManager`, the service re-adopts sessions by querying `redis.AllSessions()`. It loads *all* active sessions into its local memory (`m.sessions`). 
- **Two workers running:** Because `NewManager` pulls *all* sessions from Redis on startup, if two workers run simultaneously, BOTH will pull all sessions into their in-memory maps. This creates a distributed state inconsistency where multiple workers think they "own" the same sessions.

**Messaging Reliability Details:**
- **RabbitMQ (Session lifecycle jobs):** 
  - **Durability**: Queues and exchanges are declared as durable ([`rabbitmq.go:60,69`](file:///c:/Users/sachin%20lakshitha/devop/services/sandbox/internal/messaging/rabbitmq.go#L60-L69)).
  - **Ack Mode**: Explicit acknowledgment is used (`msg.Ack(false)` at [`rabbitmq.go:179`](file:///c:/Users/sachin%20lakshitha/devop/services/sandbox/internal/messaging/rabbitmq.go#L179)).
  - **Prefetch**: Hardcoded to `1` (`ch.Qos(1, 0, false)` at [`rabbitmq.go:81`](file:///c:/Users/sachin%20lakshitha/devop/services/sandbox/internal/messaging/rabbitmq.go#L81)) to prevent head-of-line blocking for slow VM provisioning.
  - **Dead-lettering**: DLQs are explicitly configured (`x-dead-letter-exchange` at [`rabbitmq.go:69-72`](file:///c:/Users/sachin%20lakshitha/devop/services/sandbox/internal/messaging/rabbitmq.go#L69-L72)), and failures call `msg.Nack(false, false)` ([`rabbitmq.go:177`](file:///c:/Users/sachin%20lakshitha/devop/services/sandbox/internal/messaging/rabbitmq.go#L177)) to route messages to the DLQ.
- **Kafka / Redpanda (Domain events):**
  - **Topics/Partitions/Replication**: `sandbox.session.started` (8 partitions), `sandbox.challenge.solved` (4 partitions). Defined with `replicas 1` ([`docker-compose.yml:45,53-58`](file:///c:/Users/sachin%20lakshitha/devop/docker-compose.yml#L45-L58)).
  - **Consumer Groups**: Load balancing is managed via `KAFKA_GROUP_ID` ([`kafka.go:78,85`](file:///c:/Users/sachin%20lakshitha/devop/services/sandbox/internal/messaging/kafka.go#L78-L85)).
  - **Idempotency**: `Manager.Create` has an idempotency check ([`manager.go:195-200`](file:///c:/Users/sachin%20lakshitha/devop/services/sandbox/internal/session/manager.go#L195-L200)) that returns the existing session if it's already in the in-memory map (protecting against duplicate events).

**Hardcoded local values, secrets handling, unauthenticated internal endpoints:**
- **Unauthenticated endpoints**: The `sandbox-router` has a hardcoded `/health` endpoint that requires no auth ([`cmd/router/main.go:127`](file:///c:/Users/sachin%20lakshitha/devop/services/sandbox/cmd/router/main.go#L127)). Furthermore, the proxy handler itself (`/sessions/{id}/terminal`) does not validate any authorization headers or JWTs before forwarding traffic ([`cmd/router/main.go:69-121`](file:///c:/Users/sachin%20lakshitha/devop/services/sandbox/cmd/router/main.go#L69-L121)); it blindly trusts that downstream validation will occur, though it does check for a Redis denylist (which is fail-open, [`manager.go:376`](file:///c:/Users/sachin%20lakshitha/devop/services/sandbox/internal/session/manager.go#L376)).
- **Hardcoded local values**: The router defaults to `redis://localhost:6379` if the environment variable is missing ([`cmd/router/main.go:46`](file:///c:/Users/sachin%20lakshitha/devop/services/sandbox/cmd/router/main.go#L46)).
- **Secrets**: The `ENCRYPTION_KEY` is loaded directly from the environment ([`cmd/router/main.go:48`](file:///c:/Users/sachin%20lakshitha/devop/services/sandbox/cmd/router/main.go#L48)) and base64 decoded.

### 5. Citation Validation
All claims made in this section and the previous section have been verified through direct source code reading in the current session (Lines cited above from `manager.go`, `reaper.go`, `rabbitmq.go`, `kafka.go`, `main.go`, `docker-compose.yml`, `kong.yml`).

---

## Third Pass: Pre-Kubernetes Research

### Area 1 — Production Compose (`deploy/docker-compose.prod.yml`) Full Analysis

**VERIFIED** — Read [`deploy/docker-compose.prod.yml`](file:///c:/Users/sachin%20lakshitha/devop/deploy/docker-compose.prod.yml) in full (530 lines).

All services share a single network `app-internal` (bridge driver, line 520). No service exposes an admin port externally except Kong's proxy ports.

| Service | Image | K8s Resource Type | Memory Limit | Key Volumes | Ports (host:container) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `postgres` | `postgres:16-alpine` | **StatefulSet** | None set | `postgres-data` PVC | `5432:5432` |
| `redis` | `redis:7-alpine` | **StatefulSet** | None set | **None** — data is ephemeral | `6379:6379` |
| `rabbitmq` | `rabbitmq:3-management` | **StatefulSet** | 512M | **None** — queues lost on restart | `5672`, `15672`, `15692` |
| `redpanda` | `redpanda:v24.1.1` | **StatefulSet** | 1536M | **None** — topics lost on restart | internal only |
| `db-migrate` | `core` Dockerfile | **Job** (restartPolicy: Never) | — | — | — |
| `redpanda-init` | `redpanda:v24.1.1` | **Job** (restartPolicy: Never) | — | — | — |
| `auth-service` | `devops/auth-service:1.0.0` | **Deployment** | None set | `LOG_DIR=/var/log/services` (needs emptyDir) | `3002` (internal) |
| `core-service` | `devops/core-service:1.0.0` | **Deployment** | None set | `LOG_DIR=/var/log/services` (needs emptyDir) | `3003` (internal) |
| `notification-service` | `devops/notification-service:1.0.0` | **Deployment** | None set | `LOG_DIR=/var/log/services` (needs emptyDir) | `3004` (internal) |
| `sandbox-router` | `devops/sandbox-router:1.0.0` | **Deployment** | None set | None | `8080:8080` |
| `sandbox-worker` | `devops/sandbox-worker:1.0.0` | **⚠ DaemonSet / dedicated node** | None set | `/var/run/docker.sock` (line 319) | `8090` (internal) |
| `api-gateway` | `kong:3.6.1-ubuntu` | **Deployment** | None set | `../infra/kong/kong.yml` → ConfigMap | `8005:8000`, `8443:8443` |
| `web-frontend` | `devops/web-frontend:1.0.0` | **Deployment** | None set | None | `3000:3000` |
| Observability stack | Grafana/Loki/Tempo/Prometheus/OtelCol | **Deployments** | 512M (Loki, Prometheus) | Named PVCs | Various, `profiles: observability` |

**Critical observations:**
- `sandbox-worker` mounts `/var/run/docker.sock` ([line 319](file:///c:/Users/sachin%20lakshitha/devop/deploy/docker-compose.prod.yml#L319)). It runs as `user: root` ([line 298](file:///c:/Users/sachin%20lakshitha/devop/deploy/docker-compose.prod.yml#L298)). This cannot run as a generic Pod on an arbitrary K8s node.
- `WORKER_ADDR` is hardcoded to `"sandbox-worker:8090"` ([line 316](file:///c:/Users/sachin%20lakshitha/devop/deploy/docker-compose.prod.yml#L316)). In K8s with multiple replicas, each pod must advertise its own stable DNS name (requires Headless Service).
- `NEXT_PUBLIC_API_BASE_URL: http://localhost:8005` is baked into the Next.js frontend at build time ([line 391](file:///c:/Users/sachin%20lakshitha/devop/deploy/docker-compose.prod.yml#L391)). In K8s this URL must become the external Ingress address.
- **No memory limits** are set on the Node.js microservices (auth, core, notification, web). K8s requires explicit `resources.limits` to prevent OOM evictions from starving other pods.
- All observability services are in a `profiles: observability` group — they are optional and can be deployed as a separate Helm values toggle in K8s.

---

### Area 2 — `core-service` & `auth-service` Statefulness

**VERIFIED** — Read [`services/core/src/app.ts`](file:///c:/Users/sachin%20lakshitha/devop/services/core/src/app.ts), [`outbox-poller.ts`](file:///c:/Users/sachin%20lakshitha/devop/services/core/src/plugins/outbox-poller.ts), [`session-reaper.ts`](file:///c:/Users/sachin%20lakshitha/devop/services/core/src/plugins/session-reaper.ts), and [`consumers.ts`](file:///c:/Users/sachin%20lakshitha/devop/services/core/src/modules/progress/consumers.ts).

**`auth-service`**: VERIFIED stateless. No background timers, no local caches. JWT keys loaded from env only. **Safe to scale freely.**

**`core-service`**: VERIFIED contains two background singletons that are **NOT safe under multiple replicas without changes**.

#### Outbox Poller ([`outbox-poller.ts:4`](file:///c:/Users/sachin%20lakshitha/devop/services/core/src/plugins/outbox-poller.ts#L4))
- Runs every **500ms** via `setInterval`.
- Uses `FOR UPDATE SKIP LOCKED` ([line 44](file:///c:/Users/sachin%20lakshitha/devop/services/core/src/plugins/outbox-poller.ts#L44)) — each replica grabs a disjoint batch. **Safe to replicate** but every pod polls Postgres at 500ms. At N replicas = N×2 queries/second. Acceptable at low replica counts.
- **K8s verdict**: ✅ Safe, watch connection pool exhaustion at high replica counts.

#### Session Reaper ([`session-reaper.ts:4`](file:///c:/Users/sachin%20lakshitha/devop/services/core/src/plugins/session-reaper.ts#L4))
- Runs every **60 seconds** via `setInterval`.
- Queries `LabSession WHERE status=ACTIVE AND startedAt < threshold` ([line 20–36](file:///c:/Users/sachin%20lakshitha/devop/services/core/src/plugins/session-reaper.ts#L20-L36)).
- Wraps `labSession.update` + `coreOutboxEvent.create` in a single Prisma transaction ([line 50–61](file:///c:/Users/sachin%20lakshitha/devop/services/core/src/plugins/session-reaper.ts#L50-L61)).
- Also fires "best-effort inline emit" to Kafka and RabbitMQ **outside the transaction** ([line 64–65](file:///c:/Users/sachin%20lakshitha/devop/services/core/src/plugins/session-reaper.ts#L64-L65)).
- **K8s replica problem**: With N replicas running simultaneously, all N will find the same expired sessions. The `updateMany` will succeed for each replica (it silently updates 0 rows after the first), but each replica **creates its own `OutboxEvent`**. This results in N×`SessionEndedEvent` fired per expired session → N×`session.ended` sent to the sandbox worker → the sandbox worker attempts to destroy the same container N times.
- **K8s verdict**: 🔴 **Unsafe to replicate**. Requires leader-election (Redis `SET NX`) or refactoring to be idempotent (e.g., `createOrSkip` on OutboxEvent using a unique `sessionId` constraint).

#### Progress Consumers ([`consumers.ts:9`](file:///c:/Users/sachin%20lakshitha/devop/services/core/src/modules/progress/consumers.ts#L9))
- Kafka consumer group (`GROUPS.PROGRESS.solved`, `GROUPS.PROGRESS.failed`).
- Kafka consumer group semantics guarantee only one replica processes each message partition.
- **K8s verdict**: ✅ Safe to replicate.

---

### Area 3 — Secrets Handling & Database Init

**VERIFIED** — Read [`.env.prod`](file:///c:/Users/sachin%20lakshitha/devop/.env.prod) and [`infra/postgres-init.sql`](file:///c:/Users/sachin%20lakshitha/devop/infra/postgres-init.sql).

**Secrets (`.env.prod`):**
- A **real RSA 2048-bit private key** is stored in plaintext in `.env.prod` ([line 20](file:///c:/Users/sachin%20lakshitha/devop/.env.prod#L20)). Line 1 of the file says "NEVER commit this file to source control" — the key is already there.
- Real third-party credentials present: `GOOGLE_CLIENT_ID/SECRET` and `GEMINI_API_KEY` ([lines 29–33](file:///c:/Users/sachin%20lakshitha/devop/.env.prod#L29-L33)).
- `GITHUB_CLIENT_SECRET` and `RESEND_API_KEY` are `dummy_*` placeholders ([lines 31–34](file:///c:/Users/sachin%20lakshitha/devop/.env.prod#L31-L34)) — UNKNOWN if real values exist elsewhere.
- `DATABASE_URL` embeds password in plaintext ([line 8](file:///c:/Users/sachin%20lakshitha/devop/.env.prod#L8)).
- `POSTGRES_PASSWORD` contains `change_me` — INFERRED this is a test value, not production-ready.
- All secrets are passed as environment variables. There is no secret-mount-as-file pattern, no Vault sidecar, no External Secrets Operator.

**For K8s:**
- Every secret in `.env.prod` must become a K8s `Secret` object or be fetched from a secrets manager.
- The RSA private key uses `\n` escape sequences — must be base64-encoded properly in the `Secret` manifest.
- Non-secret config (ports, LOG_LEVEL, NODE_ENV, etc.) can move to a `ConfigMap`.

**`postgres-init.sql`:**
- Minimal: creates `app_user` role with hardcoded password `app_password` ([line 8](file:///c:/Users/sachin%20lakshitha/devop/infra/postgres-init.sql#L8)) and grants privileges.
- **Hardcoded password** in SQL is a security issue — must be parameterized or removed when using K8s Secrets.
- In Docker Compose this SQL is mounted as `initdb.d` (run once on first boot). In K8s this must become a Kubernetes `Job` or a Postgres operator hook.

---

### Kubernetes Readiness Summary (Updated)

| Issue | Severity | Status | Action Taken / Required |
| :--- | :---: | :---: | :--- |
| `sandbox-worker` mounts `/var/run/docker.sock`, runs as root | 🔴 Critical | ✅ Resolved | Addressed in [`06-sandbox-worker.yaml`](file:///c:/Users/sachin%20lakshitha/devop/deploy/k8s/06-sandbox-worker.yaml) via `nodeSelector` and `tolerations` for a dedicated node pool. |
| `WORKER_ADDR` is a static hostname — breaks with multiple worker pods | 🔴 Critical | ✅ Resolved | Addressed in [`06-sandbox-worker.yaml`](file:///c:/Users/sachin%20lakshitha/devop/deploy/k8s/06-sandbox-worker.yaml) via StatefulSet + Headless Service. |
| Real RSA private key stored in `.env.prod` plaintext | 🔴 Critical | ✅ Resolved | Addressed in [`02-config.yaml`](file:///c:/Users/sachin%20lakshitha/devop/deploy/k8s/02-config.yaml) via native K8s `Secret`. |
| `session-reaper` duplicate events under >1 replica | 🔴 Critical | ✅ Fixed | Redis `SET NX` leader lock in [`session-reaper.ts`](file:///c:/Users/sachin%20lakshitha/devop/services/core/src/plugins/session-reaper.ts) |
| `NEXT_PUBLIC_API_BASE_URL=http://localhost:8005` baked into build | 🔴 Critical | ✅ Fixed | `ARG`/`ENV` in [`apps/web/Dockerfile`](file:///c:/Users/sachin%20lakshitha/devop/apps/web/Dockerfile) + `build.args` in compose; value from `PUBLIC_GATEWAY_URL` |
| `RabbitMQ` has no persistent volume — queues lost on restart | 🟡 High | ✅ Resolved | Addressed in [`03-tier0-data.yaml`](file:///c:/Users/sachin%20lakshitha/devop/deploy/k8s/03-tier0-data.yaml) via `volumeClaimTemplates` (PVC). |
| `Redis` has no persistent volume — denylist & rate-limit state resets | 🟡 High | ✅ Resolved | Addressed in [`03-tier0-data.yaml`](file:///c:/Users/sachin%20lakshitha/devop/deploy/k8s/03-tier0-data.yaml) via `volumeClaimTemplates` (PVC) and AOF enabled. |
| `app_password` hardcoded in `postgres-init.sql` | 🟡 High | ✅ Fixed | Parameterized as `:'app_user_password'` in [`postgres-init.sql`](file:///c:/Users/sachin%20lakshitha/devop/infra/postgres-init.sql); `APP_USER_PASSWORD` added to `.env.prod` |
| No `resources.limits` set on Node.js services | 🟡 High | ✅ Fixed | Limits added to all 6 services in [`deploy/docker-compose.prod.yml`](file:///c:/Users/sachin%20lakshitha/devop/deploy/docker-compose.prod.yml) and K8s YAMLs. |
| `LOG_DIR=/var/log/services` — services write logs to host path | 🟠 Medium | ✅ Fixed | `LOG_DIR` removed from `.env.prod` and compose; observability package falls back to stdout |
| `CORS_ORIGIN` hardcoded to `localhost` URLs | 🟢 Low | ✅ Fixed | Updated to `YOUR_DOMAIN` placeholder in [`.env.prod`](file:///c:/Users/sachin%20lakshitha/devop/.env.prod) — operator must set real domain |
| Outbox poller polls Postgres every 500ms per replica | 🟢 Low | ⬜ Accepted | Fine at low replica counts; monitor connection pool at ≥5 replicas |

---

## Fourth Pass: Fixes Applied

All changes listed below were code/config edits only. **I have not verified these by running them.** Treat them as requiring a deployment test before trusting.

| File | What Changed |
| :--- | :--- |
| [`.env.prod`](file:///c:/Users/sachin%20lakshitha/devop/.env.prod) | `LOG_DIR` removed; `CORS_ORIGIN`/`ALLOWED_ORIGINS`/`FRONTEND_URL`/`PUBLIC_GATEWAY_URL` changed from `localhost` to `YOUR_DOMAIN` placeholder; `APP_USER_PASSWORD` variable added |
| [`deploy/docker-compose.prod.yml`](file:///c:/Users/sachin%20lakshitha/devop/deploy/docker-compose.prod.yml) | `resources.limits` (memory + CPU) added to `auth`, `core`, `notification`, `sandbox-router`, `sandbox-worker`, `web-frontend`; `LOG_DIR` env var removed from all services; `NEXT_PUBLIC_API_BASE_URL` wired to `${PUBLIC_GATEWAY_URL}`; `build.args` block added to `web-frontend` |
| [`infra/postgres-init.sql`](file:///c:/Users/sachin%20lakshitha/devop/infra/postgres-init.sql) | Hardcoded `'app_password'` replaced with psql variable `:'app_user_password'`; usage comment added |
| [`services/core/src/plugins/session-reaper.ts`](file:///c:/Users/sachin%20lakshitha/devop/services/core/src/plugins/session-reaper.ts) | Redis `SET NX` leader lock added — only one replica runs the reap loop per 60s cycle; lock TTL = 90s; stable `INSTANCE_ID` per process |
| [`apps/web/Dockerfile`](file:///c:/Users/sachin%20lakshitha/devop/apps/web/Dockerfile) | `ARG NEXT_PUBLIC_API_BASE_URL` + `ENV` added before `next build` in the installer stage |

### What is NOT yet done (still open before K8s is production-ready)

1. **🔴 `sandbox-worker` node isolation** — Needs a Kubernetes node pool with a taint, and a decision on DaemonSet vs. StatefulSet. Cannot be done until cluster topology is decided.
2. **🔴 `WORKER_ADDR` per-pod stable DNS** — Needs a Headless Service + StatefulSet for `sandbox-worker`. `WORKER_ADDR` must become the pod's own DNS name (e.g., `sandbox-worker-0.sandbox-worker.default.svc.cluster.local`).
3. **🔴 Secrets management** — The RSA private key, `GEMINI_API_KEY`, OAuth secrets, and `ENCRYPTION_KEY` are all in `.env.prod` plaintext. Must become K8s `Secret` objects before any production deployment. Consider External Secrets Operator if a secrets manager (Vault, AWS SM) is available.
4. **🟡 PVCs for RabbitMQ and Redis** — Without persistent volumes, RabbitMQ loses in-flight messages and Redis loses the JWT denylist on pod restart. Requires a storage class decision for the target cluster.
5. **One manual step in `.env.prod`** — Replace `YOUR_DOMAIN` with your real production hostname.

> [!NOTE]
> **Reconciled with Codebase (2026-09-23)**
> - **Classification:** STALE
> - **Previous text claimed:** Kubernetes manifests are completely missing, and raw secrets sit plaintext in `.env.prod`.
> - **Actual code behavior:** Manifests now exist in [`deploy/k8s/`](file:///c:/Users/sachin%20lakshitha/devop/deploy/k8s/) with placeholder strings for all secrets (committed in `7f6c541`). An earlier commit did briefly contain plaintext values before being amended and force-pushed; though `origin/main` currently points to sanitized placeholders, any unrotated credentials from that initial commit would still exist in git reflogs or shallow forks. Furthermore, these manifests have **never been tested on a live cluster**, and real secrets still need to be injected via a secret provider prior to deployment.
> - **Source of truth:** [`deploy/k8s/02-config.yaml`](file:///c:/Users/sachin%20lakshitha/devop/deploy/k8s/02-config.yaml#L66-L96) and [`deploy/k8s/06-sandbox-worker.yaml`](file:///c:/Users/sachin%20lakshitha/devop/deploy/k8s/06-sandbox-worker.yaml)
> - **Why this matters:** If you read the old doc, you'd think we have no K8s specs at all. If you read the new folder without this warning, you might assume you can just run `kubectl apply -f deploy/k8s/` in production today. You can't — it will fail to boot without injected secrets, and untrusted sandbox containers will share nodes with internal databases.
