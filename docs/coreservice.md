# Core Service Deep-Dive (`services/core`)

Detailed architecture, session orchestration, content graph, outbox pipeline, and resilience mechanisms of `core-service`. Traced directly from source code in `services/core/src/`.

---

## 1. Role & Architecture Overview

`core-service` is the central orchestrator of the learning platform:
- **Content Plane**: Serves challenges, modules, learning paths, quizzes, articles, and flashcards.
- **Session Orchestration**: Manages `LabSession` lifecycle, atomic Redis session locking, and dispatches provisioning jobs to RabbitMQ / Kafka.
- **Progress Tracking & Gamification**: Consumes `sandbox.challenge.solved` and `sandbox.challenge.failed` Kafka events to update user XP, unlock DAG nodes, track streaks, and issue badges.
- **B2B Multi-Tenancy**: Manages organizations (`Org`), custom organizational scenarios (`OrgScenario`), invitations, path assignments, and analytics.

---

## 2. Session Start & Provisioning Pipeline

When a user clicks "Start Challenge" (`POST /api/challenges/:id/start`):

1. **Authentication & Authorization**: Fastify JWT authentication hook decodes access token, extracts `userId` and `orgId`.
2. **Challenge Resolution**: Loads challenge from Postgres (`prisma.challenge.findUnique`), extracting the target `dockerImage` and `requiredProvider` (`docker`, `gvisor`, `kata`, or `flintlock`).
3. **Atomic Session Lock (Redis `SET NX`)**:
   - Acquires lock key: `core:session:{userId}:{challengeId}` with TTL matching session duration.
   - Prevents duplicate provisioning races if the user double-clicks or triggers multiple concurrent requests.
   - If key already exists, aborts and returns the existing active session details.

> [!NOTE]
> **Reconciled with Codebase (2026-09-23)**
> - **Classification:** WRONG
> - **Previous text claimed:** The Redis `SET NX` lock key `core:session:{userId}:{challengeId}` uses a TTL matching the entire session duration (e.g. 60 minutes).
> - **Actual code behavior:** The lock uses a short 10-second acquisition TTL (`await fastify.redis.set(lockKey, sessionId, "EX", 10, "NX")`). Once provisioning completes or fails, the key expires quickly so users aren't locked out of their challenge if a transient crash occurs.
> - **Source of truth:** [`services/core/src/modules/challenge/challenge.routes.ts:501`](file:///c:/Users/sachin%20lakshitha/devop/services/core/src/modules/challenge/challenge.routes.ts#L501)
> - **Why this matters:** If a worker crashes mid-provisioning, a 60-minute lock would leave the user dead in the water for an hour unable to restart. With a 10-second lock, they can refresh and try again immediately.

4. **Transactional Database Write**:
   - Executes inside a Prisma `$transaction`:
     - Creates `LabSession` row with `status: ACTIVE`.
     - Creates `CoreOutboxEvent` row with `eventType: "SessionStartedEvent"`, storing `sessionId`, `userId`, `challengeId`, `image`, and `requiredProvider`.
   - **Rollback Safety**: If the database transaction fails, the Redis lock is explicitly deleted via `fastify.redis.del(lockKey)` to avoid permanently wedging the session.
5. **Event Emission & Broker Queueing**:
   - Dispatches `SessionStartedEvent` to Kafka topic `sandbox.session.started`.
   - Dispatches provisioning message to RabbitMQ queue `provision.sandbox.{provider}` (e.g. `provision.sandbox.docker`, `provision.sandbox.gvisor`, `provision.sandbox.kata`, `provision.sandbox.flintlock`).

---

## 3. Outbox Poller & Broker Circuit Breaker

To prevent the **Dual Write** problem between PostgreSQL and Kafka/RabbitMQ, `core-service` implements an asynchronous outbox worker with an automated **Circuit Breaker** (`src/plugins/outbox-poller.ts`):

```
+------------------+         +-----------------------+         +------------------+
| Postgres DB      | <====== | Core Outbox Poller    | ======> | Kafka / RabbitMQ |
| CoreOutboxEvent  |  poll   | (FOR UPDATE           | publish | Message Brokers  |
| table            |         |  SKIP LOCKED)         |         |                  |
+------------------+         +-----------+-----------+         +------------------+
                                         |
                                         v
                              [ Circuit Breaker State ]
                              • Closed: Poll every 500ms
                              • 3 Failures: Trip to OPEN
                              • Exponential backoff: 5s → 60s
                              • 5 Failures on Event: Mark Failed
```

### Key Implementation Mechanics:
- **Dedicated Outbox Table**: Uses `CoreOutboxEvent` (isolated from `AuthOutboxEvent`) to eliminate cross-service event contamination.
- **Row-Level Locking**: Executes `SELECT * FROM "CoreOutboxEvent" WHERE processed = false AND failed = false ORDER BY "createdAt" ASC LIMIT 10 FOR UPDATE SKIP LOCKED`. Allows multiple instances of `core-service` to run concurrently without duplicate message processing.
- **Circuit Breaker States**:
  - **CLOSED**: Default operational state. Polls every 500ms.
  - **TRIP (OPEN)**: After **3 consecutive broker publish failures**, the poller trips into `OPEN` state and pauses polling for `backoffMs`.
  - **Exponential Backoff**: Backoff starts at 5,000ms and doubles on consecutive trips up to 60,000ms (`MAX_BACKOFF_MS`).
  - **Reset**: Any successful event emission resets `consecutiveFailures = 0` and restores `backoffMs = 5000`.
- **Poison-Pill Protection**: If a single corrupt or un-publishable event fails 5 times (`retryCount >= 5`), it is marked `failed = true` to allow remaining events to proceed without deadlocking the queue.
- **Timeout Protection**: All Kafka emits and RabbitMQ publishes are guarded by a 5-second `Promise.race` timeout.

---

## 4. Challenge Validation & Lifecycle Management

### Live Session Termination (`DELETE /api/session/:id`)
- Sets `LabSession.status = TERMINATED` and sets `endedAt = now()`.
- Creates `CoreOutboxEvent` with `eventType: "SessionEndedEvent"`, reason `"terminated"`.
- Emits termination commands to RabbitMQ (`terminate.sandbox`) and Kafka (`sandbox.session.ended`).
- The `sandbox-worker` tears down the container or microVM and removes the session from Redis.

### Automated TTL Reaper & Daemon Orphan Sweeper
- The `sandbox-worker` runs an internal ticker-based reaper (`internal/session/reaper.go`).
- When a session exceeds its allocated `ttlMins` (default 60 minutes), the sandbox worker terminates the container and emits a `session.ended` event with `reason: "expired"`.
- In addition to tracked sessions, the reaper runs a daemon-level sweep across container engines every minute to discover unindexed containers carrying `managed-by: devops-platform-sandbox` that are absent from memory/Redis and older than a 5-minute grace period.

### Provisioning Failure Handling
- If `sandbox-worker` fails to provision a container/microVM, it broadcasts `StageFailed` via SSE, purges transient state from Redis, and emits `SessionFailedEvent` (`sandbox.session.failed`) to Kafka.
- `core-service` consumes `sandbox.session.failed` and immediately transitions the `LabSession` in PostgreSQL from `ACTIVE` to `TERMINATED`.

---

## 5. Learning Path DAG & Content Graph

The curriculum is represented as a Directed Acyclic Graph (DAG) using `Node` and `Edge` models:
- **`NodeType`**: `CONCEPT` (theory), `SCENARIO` (practical lab), `QUIZ` (knowledge assessment).
- **DAG Traversal**: `modules/content/node.routes.ts` uses PostgreSQL Recursive Common Table Expressions (CTEs) to evaluate prerequisites, child nodes, and identify the user's unlocked learning frontier.
- **Completion Tracking**: Stored in the `Completion` composite table (`[userId, nodeId]`). A node is marked complete when its corresponding challenge is solved or quiz is passed.

---

## 6. Service Health & Observability

- **Health Endpoint**: `GET /health` evaluates database queries and Kafka producer readiness using the cached `HealthRegistry`.
- **Prometheus Metrics**: Exposes `GET /metrics` tracking active sessions, challenge starts, and HTTP request durations.
- **Distributed Tracing**: Integrates with `@devops/observability` and OpenTelemetry to inject trace context across outbox events and HTTP request flows.
