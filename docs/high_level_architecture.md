# High Level Architecture

## Sources reviewed

- `docker-compose.yml`
- `docker-compose.prod.yml`
- `infra/kong/kong.yml`
- `services/auth/package.json`
- `services/core/package.json`
- `services/notification/package.json`
- `services/sandbox/go.mod`
- `apps/web/package.json`
- `docs/adr/007-firecracker-microvms.md`
- `docs/adr/009-hybrid-sandbox-strategy.md`
- Source code in `apps/web/src`, `services/auth/src`, `services/core/src`, and `services/sandbox/internal`

---

## 1. System overview

The system is a DevOps lab platform where users can authenticate, start interactive sandbox sessions (challenges), and execute commands in terminal environments. The backend consists of Node.js and Go microservices orchestrating Docker containers to run challenges for users. The architecture utilizes an event-driven approach with Kafka (Redpanda) and RabbitMQ for asynchronous processing, and Kong as a REST API gateway for synchronous client requests.

---

## 2. Service inventory

| Service name           | What it does                                                                                                                                                                                  | Language/runtime     | Exposed ports/routes                                                                 | Source location         |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------ | ----------------------- |
| `web-frontend`         | Next.js frontend serving the user interface.                                                                                                                                                  | Node.js (Next.js)    | Port `3000`                                                                          | `apps/web`              |
| `core-service`         | Manages challenges, content, and session lifecycles. Emits session events to Kafka and RabbitMQ.                                                                                              | Node.js (TypeScript) | Kong routes: `/api/challenges`, `/api/session`, `/api/content`. Internal port `3003` | `services/core`         |
| `auth-service`         | Handles user authentication and OAuth, emits user registration events.                                                                                                                        | Node.js (TypeScript) | Kong routes: `/api/auth`. Internal port `3002`                                       | `services/auth`         |
| `notification-service` | Consumes messages to send notifications (e.g., using Resend).                                                                                                                                 | Node.js (TypeScript) | Internal port `3004`                                                                 | `services/notification` |
| `sandbox-worker`       | Provisions and manages Docker containers for user sessions, validates challenge execution, and handles WebSocket terminal connections. Consumes commands from RabbitMQ and events from Kafka. | Go                   | Kong routes: `/sessions`, `/validate`. Internal port `8090`                          | `services/sandbox`      |
| `api-gateway` (Kong)   | Acts as the entrypoint for backend API traffic, providing routing and rate-limiting using Redis.                                                                                              | Kong (Ubuntu)        | Ports `8000` (`8005` in prod), `8443`. Admin `8001`, `8444`                          | `infra/kong`            |

> [!NOTE]
> **Reconciled with Codebase (2026-09-23)**
> - **Classification:** MISSING
> - **Previous text claimed:** The service inventory listed only `sandbox-worker` as handling `/sessions` and `/validate`, omitting `sandbox-router`.
> - **Actual code behavior:** Kong forwards `/sessions` and `/validate` traffic to `sandbox-router` on port `8080` (`url: http://sandbox-router:8080` in `infra/kong/kong.yml`). `sandbox-router` queries Redis to find which specific worker node holds the session and dynamically proxies WebSocket and validation traffic to `sandbox-worker:8090`.
> - **Source of truth:** [`infra/kong/kong.yml:117-128`](file:///c:/Users/sachin%20lakshitha/devop/infra/kong/kong.yml#L117-L128) and [`services/sandbox/cmd/router/main.go`](file:///c:/Users/sachin%20lakshitha/devop/services/sandbox/cmd/router/main.go)
> - **Why this matters:** If you trusted this inventory, you'd think client connections hit the worker directly and wonder why the worker isn't registered in Kong. If `sandbox-router` goes down, terminal traffic fails completely even if all workers are healthy.

---

## 3. External dependencies

- **PostgreSQL / Citus** (`appdb`): Primary distributed relational database cluster (1 Citus Coordinator + 2 Shard Workers in K8s). Used by `auth-service` and `core-service`. Supports horizontal table sharding and co-located joins.
- **Redis (HA Sentinel + HAProxy)**: High-availability caching, token denylists, and gateway rate-limiting (3 Redis pods + 3 Sentinels fronted by HAProxy VIP on port 6379). Used by Kong, `auth-service`, `core-service`, `notification-service`, and `sandbox-router`.
- **Redpanda (Kafka Raft Cluster)**: High-availability event streaming platform (3 broker replicas with topic replication factor = 3). Provisioned topics include `identity.user.registered`, `identity.email.verification`, `sandbox.session.started`, `sandbox.session.ended`, `sandbox.challenge.solved`, `sandbox.challenge.failed`.
- **RabbitMQ (HA Mesh)**: High-availability message broker (3 clustered nodes with Raft Quorum Queues). Consumed by `notification-service` and `sandbox-worker`.
- **Observability Stack**: Prometheus (metrics), Loki (logs), Tempo (traces), Grafana (dashboards), and OpenTelemetry Collector.

> [!NOTE]
> **Reconciled with Codebase (2026-09-23)**
> - **Classification:** WRONG
> - **Previous text claimed:** `sandbox-worker` connects to PostgreSQL as an external dependency.
> - **Actual code behavior:** `sandbox-worker` is decoupled from PostgreSQL. It holds no SQL connection and does not run SQL queries; it relies strictly on Redis for session lookups and Kafka (`sandbox.challenge.solved`/`failed`) to report challenge outcomes asynchronously.
> - **Source of truth:** [`services/sandbox/internal/config/config.go`](file:///c:/Users/sachin%20lakshitha/devop/services/sandbox/internal/config/config.go) and [`services/sandbox/cmd/worker/main.go`](file:///c:/Users/sachin%20lakshitha/devop/services/sandbox/cmd/worker/main.go)
> - **Why this matters:** If you're investigating a database connection pool spike or running a DB migration, you'd waste time checking worker logs for SQL errors. The worker only talks to Docker, Redis, RabbitMQ, and Kafka.

---

## 4. Inter-service dependency map

- `web-frontend` calls `api-gateway` via HTTP/REST requests.
- `api-gateway` routes HTTP requests to:
  - `auth-service` for `/api/auth`
  - `core-service` for `/api/challenges`, `/api/session`, `/api/content`
  - `sandbox-worker` for `/sessions`, `/validate`
    (source: `infra/kong/kong.yml`)
- `auth-service`:
  - Directly accesses Postgres.
  - Persists events to `AuthOutboxEvent` table and publishes them to Kafka (e.g., `UserRegisteredEvent`) via its dedicated outbox processor (`services/auth/src/plugins/outbox.ts`).
- `core-service`:
  - Directly accesses Postgres.
  - Persists events to `CoreOutboxEvent` table and publishes session lifecycle events to Kafka (`SessionStartedEvent`, `SessionEndedEvent`) and provisioning jobs to RabbitMQ (`PROVISION_SANDBOX`, `TERMINATE_SANDBOX`).
- `sandbox-worker`:
  - Decoupled from direct SQL database connections; emits results to Kafka (`sandbox.challenge.solved`, `sandbox.challenge.failed`).
  - Consumes provisioning and teardown jobs from RabbitMQ (`services/sandbox/internal/messaging/rabbitmq.go`).
  - Connects to the Docker daemon via `/var/run/docker.sock` to provision containers (source: `docker-compose.yml`).
- `notification-service`:
  - Connects to RabbitMQ and Redis (source: `docker-compose.yml`).

---

## 5. Major request flows

**1. Starting a Challenge Session**

1. User initiates a session via `web-frontend` which calls an API routed through `api-gateway` to `core-service` (source: `infra/kong/kong.yml`).
2. `core-service` handles the request and publishes a `PROVISION_SANDBOX` message to RabbitMQ and a `SessionStartedEvent` to Kafka (source: `services/core/src/modules/challenge/challenge.routes.ts`).
3. `sandbox-worker` consumes the RabbitMQ message and provisions a Docker container for the user session (source: `services/sandbox/main.go` and `services/sandbox/internal/messaging/rabbitmq.go`).
   - If provisioning fails, `sandbox-worker` emits a `SessionFailedEvent` (`sandbox.session.failed`) to Kafka, clears transient Redis state, and broadcasts a `FAILED` progress event over SSE/WebSocket. `core-service` consumes `sandbox.session.failed` and transitions the database session status to `TERMINATED`.
   - The sandbox reaper runs a daemon-level sweep across container engines every minute to purge unindexed orphan containers (`managed-by=devops-platform-sandbox` older than 5m grace period) in case of worker restarts.

**2. Terminal Access**

1. User client connects to `GET /sessions/...` (WebSocket) routed via `api-gateway` to `sandbox-worker` on port `8090` (source: `infra/kong/kong.yml`).
2. `sandbox-worker` manages the WebSocket connection and proxies the terminal I/O streams directly to the running Docker container (source: `services/sandbox/go.mod` referring to `github.com/gorilla/websocket` and `docker` API usage).

**3. User Authentication**

1. User attempts OAuth login via `web-frontend`, which is routed to `auth-service` under the `/api/auth/...` paths (source: `infra/kong/kong.yml`).
2. `auth-service` validates credentials, accesses Postgres to update user data, and persists an outbox event.
3. An outbox poller within `auth-service` subsequently publishes a `UserRegisteredEvent` (or similar) to Kafka (source: `services/auth/src/plugins/outbox.ts`).

---

## 6. Deployment topology

- **Networks**: Defined via `docker-compose.yml` and `docker-compose.prod.yml`, utilizing custom networks `app-internal` and `global-proxy-net`.
- **Public vs Internal**: `web-frontend` and `api-gateway` are exposed to the host machine (ports `3000` and `8000`/`8443`). Backend services (`auth-service`, `core-service`, `notification-service`, `sandbox-worker`, Postgres, Redis, RabbitMQ, Redpanda) communicate over the internal `app-internal` network. `sandbox-worker` mounts the host's Docker socket (`/var/run/docker.sock`) to manage containers.
- **Healthchecks**: Actively configured for datastores and critical components (e.g., Postgres `pg_isready`, Redis `ping`, RabbitMQ `rabbitmq-diagnostics ping`, Kong `kong health`, and Redpanda `rpk cluster info`). The backend services define `depends_on` with `condition: service_healthy` to wait for their datastores to be ready.

---

## 7. Supported Sandbox Isolation Backends

The sandbox service (`services/sandbox`) contains implementations for multiple sandbox runtime providers via the `SandboxProvider` interface:

- **Standard Docker** ([docker.go](file:///c:/Users/sachin%20lakshitha/devop/services/sandbox/internal/sandbox/docker.go)): Host container execution with capability drops (`CapDrop: ALL`, `no-new-privileges`) and resource constraints.
- **gVisor (`runsc`)** ([gvisor.go](file:///c:/Users/sachin%20lakshitha/devop/services/sandbox/internal/sandbox/gvisor.go)): Intercepts guest system calls using Google's application kernel sandbox.
- **Kata Containers (`kata-fc` / `kata-qemu`)** ([kata.go](file:///c:/Users/sachin%20lakshitha/devop/services/sandbox/internal/sandbox/kata.go)): Hardware-isolated lightweight microVMs wrapping containers.
- **Flintlock MicroVMs** ([flintlock.go](file:///c:/Users/sachin%20lakshitha/devop/services/sandbox/internal/sandbox/flintlock.go)): Firecracker MicroVMs provisioned via Flintlock gRPC API with SSH terminal bridges.

---

