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

---

## 3. External dependencies

- **Postgres** (`appdb`): Primary relational database used by `auth-service`, `core-service`, and `sandbox-worker` (source: `docker-compose.yml` environment variables).
- **Redis**: Used for rate-limiting by the API Gateway (source: `infra/kong/kong.yml`), and as a key-value store by `auth-service`, `core-service`, `notification-service`, and `sandbox-worker` (source: `docker-compose.yml` `REDIS_URL` references).
- **Redpanda (Kafka)**: Event streaming platform. Provisioned topics include `identity.user.registered`, `identity.email.verification`, `sandbox.session.started`, `sandbox.session.ended`, `sandbox.challenge.solved`, `sandbox.challenge.failed` (source: `docker-compose.yml` `redpanda-init` script). `core-service`, `auth-service`, and `sandbox-worker` connect to it.
- **RabbitMQ**: Used for message queueing, particularly consumed by `notification-service` and `sandbox-worker` (which consumes session commands), and published by `core-service` (source: `services/core/src/modules/challenge/challenge.routes.ts` and `services/sandbox/main.go`).
- **Observability Stack**: Prometheus (metrics), Loki (logs), Tempo (traces), Grafana (dashboards), and OpenTelemetry Collector (source: `docker-compose.yml`).

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

## 7. Proposed But Not Yet Implemented

- **Firecracker MicroVMs**: ADRs `007-firecracker-microvms.md` and `009-hybrid-sandbox-strategy.md` describe using Firecracker for isolated sandboxing via containerd. However, source code in `services/sandbox/internal/sandbox/provider.go` explicitly marks this as a future implementation ("MVP: DockerProvider. Future: GVisorProvider, FirecrackerProvider"). No Firecracker API integration or containerd shims were found in the current Go source code logic.

---

## 8. Open Questions / Unverified

- Does `notification-service` listen to Kafka topics (e.g. `identity.email.verification`) or RabbitMQ specifically for email notifications? (The configuration points to both messaging platforms, but the specific topics consumed aren't directly confirmed).
- How does `sandbox-worker` validate challenge completions (`/validate` route)? Does it execute a script inside the Docker container or check the filesystem state externally?
- How is the `appdb` Postgres database partitioned or shared among `core-service`, `auth-service`, and `sandbox-worker`? They all share the same `DATABASE_URL` pointing to `appdb`, but it's unclear if they use separate schemas or simply share the `public` schema.
