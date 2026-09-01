# Sandbox Service - Software Design & Requirements Specification (SRS)

## 1. System Architecture

The Sandbox Service (`sandbox-worker`) is the orchestration and isolation engine for user terminal sessions. It provisions secure containers, multiplexes WebSocket connections to shared shells, and enforces TTLs, network isolation, and resource quotas.

### 1.1 Core Topology
* **Consumer**: Subscribes to `provision.sandbox` on RabbitMQ to spawn sessions.
* **Worker**: Starts sandboxed containers via a configured provider (Docker, gVisor, Kata, Flintlock).
* **Terminal Multiplexer**: Exposes a WebSocket on `:8090` that streams PTY output to authorized Next.js clients.
* **Validation**: API Gateway routes `POST /validate/{id}` through internal network, triggering `/validator.sh` in the sandbox. Results are published to Kafka.

---

## 2. Environment Variables

The `sandbox-worker` configuration is loaded strictly once at startup (`internal/config/config.go`). **No variables are hot-reloadable**; changing any value requires restarting the service.

| Variable | Purpose | Default | Hot-Reload |
| :--- | :--- | :--- | :--- |
| `HTTP_PORT` | Port for HTTP/WS Server | (Required) | No (Restart required) |
| `KAFKA_BROKERS` | Kafka broker endpoints | (Required) | No (Restart required) |
| `KAFKA_CLIENT_ID` | Kafka client identifier | (Empty) | No (Restart required) |
| `KAFKA_GROUP_ID` | Kafka consumer group | (Empty) | No (Restart required) |
| `REDIS_URL` | Redis instance for session state | (Required) | No (Restart required) |
| `RABBITMQ_URL` | RabbitMQ connection string | `amqp://localhost:5672` | No (Restart required) |
| `DATABASE_URL` | Postgres database URL | (Required) | No (Restart required) |
| `JWT_PUBLIC_KEY` | RS256 public key (PEM) for WS Auth | (Required) | No (Restart required) |
| `ENCRYPTION_KEY` | Base64 encoded 32-byte key | (Required) | No (Restart required) |
| `SESSION_TTL_MINS` | Maximum lifetime of a sandbox session | `60` | No (Restart required) |
| `MAX_MEMORY_MB` | Container RAM limit | `512` | No (Restart required) |
| `MAX_CPUS` | Container CPU limit | `1.0` | No (Restart required) |
| `DOCKER_NETWORK_MODE` | Docker network isolation mode | `none` | No (Restart required) |
| `SANDBOX_PROVIDER` | Container runtime (`docker`, `gvisor`, `kata`, `flintlock`) | `docker` | No (Restart required) |
| `FLINTLOCK_ADDRESS` | Address for Flintlock gRPC | `localhost:9090` | No (Restart required) |
| `ALLOWED_ORIGINS` | CORS origins for WebSockets | `http://localhost:3000,http://localhost:5173` | No (Restart required) |

---

## 3. Port Reference

| Service | Protocol | Port | Exposure | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `sandbox-worker` | HTTP/WS | 8090 | Internal | WebSocket Terminal & Validation |
| `auth-service` | HTTP | 3002 | Internal | Authentication & JWT issuance |
| `core-service` | HTTP | 3003 | Internal | Platform API & Logic |
| `notification-svc` | HTTP | 3004 | Internal | Progress events / Emails |
| `api-gateway` (Kong) | HTTP | 8005 | External | Public Proxy to internal services |
| `api-gateway` (Kong) | HTTP | 8001 | Internal | Admin API |
| `web` (Next.js) | HTTP | 3000 | External | Frontend UI |
| `postgres` | TCP | 5432 | Internal | Relational Data |
| `redis` | TCP | 6379 | Internal | Session State |
| `rabbitmq` | AMQP | 5672 | Internal | Task Queues |
| `redpanda` / `kafka` | Kafka | 9092 | Internal | Event Streaming |

---

## 4. TTL Specification

The `SESSION_TTL_MINS` environment variable (default: 60) defines the hard limit on container lifespan.

### 4.1 Formal TTL Policy Requirements
1. **Enforcement**: TTL must be enforced by an independent goroutine (`Reaper`) scanning the Redis session state every minute.
2. **Hard Termination**: When TTL expires, the container is forcibly terminated (`docker rm -f`), Redis state is purged, and the Postgres `LabSession` is marked `EXPIRED`.
3. **Pre-Expiration Warning**: The multiplexer MUST broadcast a `ttl_warning` JSON control frame to all active WebSocket clients exactly 5 minutes before expiration (or `min(5m, TTL/2)` for testing/short TTLs).
4. **Per-Tier Differentiation (Pending Implementation)**: Currently, TTL is global per deployment. In the future, TTL should be derived dynamically per session from the `core-service` provision payload, allowing enterprise tiers or specific challenges to request longer/shorter lifetimes.

---

## 5. Interface Contracts

### 5.1 RabbitMQ (Orchestration Commands)

**Queue**: `provision.sandbox` (DLQ: `provision.sandbox.dlq`)
```json
{
  "type": "session.started",
  "sessionId": "string",
  "userId": "string",
  "challengeId": "string",
  "image": "string",
  "ttlMins": 60
}
```

**Queue**: `terminate.sandbox` (DLQ: `terminate.sandbox.dlq`)
```json
{
  "type": "session.ended",
  "sessionId": "string",
  "reason": "user_left | timeout"
}
```

### 5.2 Kafka (Event Streams)

**Topic**: `sandbox.challenge.solved` (Partitions: 3, Retention: 7 days)
```json
{
  "submissionId": "uuid",
  "challengeId": "uuid",
  "userId": "uuid",
  "passed": true,
  "exitCode": 0,
  "durationMs": 1200,
  "checks": [
    { "checkId": "string", "passed": true, "message": "string" }
  ]
}
```

**Topic**: `sandbox.challenge.failed` (Partitions: 3, Retention: 7 days)
*(Identical schema to solved, with `passed: false`)*

**Topic**: `identity.user.registered` (Consumed by core/notification)
```json
{
  "userId": "uuid",
  "email": "string",
  "orgId": "uuid"
}
```

---

## 6. Runtime Provider Selection Analysis

Currently, `SANDBOX_PROVIDER` is a deployment-level environment variable evaluated once during startup.

### 6.1 Requirements for Dynamic (Per-Session) Selection
To support per-challenge or per-org runtime selection:
1. `core-service` must include a `provider` field in the `provision.sandbox` AMQP payload.
2. `sandbox-worker` `session.Manager` would require a `ProviderRegistry` containing initialized instances of Docker, gVisor, Kata, and Flintlock.
3. Redis `SessionData` must persist the selected provider so that `terminal.Multiplexer` and `validator.Validator` know which runtime API to call when attaching PTYs or running scripts.

### 6.2 Investigation & Recommendation
**Recommendation**: Maintain provider selection at the **deployment level**, not per-session.

**Reasoning**:
Per-session selection introduces severe infrastructure fragility. A single homogenous worker node is highly unlikely to have standard Docker, gVisor (`runsc`), Kata (KVM), and Flintlock (microVMs) all cleanly installed and functioning concurrently. If a high-security challenge requests `kata`, but the worker picking the AMQP message lacks hardware virtualization (KVM), the job will fail at runtime.

Instead, implement **Worker Pools with AMQP Routing Keys**:
- Deploy multiple `sandbox-worker` clusters, each homogenous and configured for a specific provider (e.g., a high-security pool with KVM enabled and `SANDBOX_PROVIDER=kata`).
- `core-service` routes the message to the appropriate queue (e.g., `provision.sandbox.kata`) based on the Challenge's security requirements.
- This guarantees that the worker receiving the job is infrastructure-capable of provisioning it, avoiding runtime failures and complex registry state management in the worker.
