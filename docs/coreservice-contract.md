# Core Service Contract

## 1. What this service guarantees

- **Durable Session Initialization**: A `200 OK` response from `POST /challenges/:id/start` guarantees that the session is durably recorded in the database and an outbox event is stored. The system promises at-least-once delivery of the provisioning command to the broker via the outbox poller. It will never silently disappear.
- **Idempotency**: Repeated calls to `POST /challenges/:id/start` within the lock TTL for the same user and challenge will safely return the existing session rather than provisioning duplicates.
- **Strict Concurrency Limits**: The service guarantees that users cannot exceed their organization's plan tier limits for concurrent active lab sessions.

### What this service does NOT guarantee (yet)

- **Real-time sandbox death detection**: If a sandbox dies mid-session, the core service currently only detects this reactively (e.g., when the user attempts an action). There is no proactive health-checking or heartbeat to tear down the session state automatically.

## 2. Public contract / API surface

### `POST /challenges/:id/start`

- **Purpose**: Initializes a new lab session for a specific challenge.
- **Inputs**: Challenge ID (path). Requires valid user authentication token.
- **Outputs**:
  - `200 OK`: Session ID, Challenge ID, Challenge Title, Gateway URLs, and TTL.
  - `404 Not Found`: Challenge does not exist.
  - `403 Forbidden`: Concurrency limit reached for the user's plan tier (e.g., `CONCURRENCY_LIMIT_REACHED`).
- **Delivery Guarantee**: At-least-once provisioning dispatch. If the broker is down, the request still succeeds, and the outbox poller will retry dispatching until acknowledged.

## 3. Failure modes and what the caller should expect

- **Message Broker Down**: The API will still return `200 OK`. The event is stored in the PostgreSQL outbox. The sandbox provisioning will be delayed until the broker recovers. The caller should expect the session to exist, but the gateway might temporarily return 502/503 until the sandbox actually spins up.
- **Database Down**: The API returns `500 Internal Server Error`. No session is created, and no lock is persisted. The caller should retry the request with exponential backoff.
- **Concurrency Limit Hit**: The API returns `403 Forbidden` (`CONCURRENCY_LIMIT_REACHED`). The caller must display a message prompting the user to upgrade their plan or terminate an existing session before continuing.
- **Redis Down**: The API returns `500 Internal Server Error` (since the idempotency lock cannot be acquired). The session cannot start.

## 4. Implementation architecture summary

The Core Service operates around a transactional outbox pattern to ensure data consistency between its local PostgreSQL database and downstream asynchronous workers (Sandbox Service).

1. **API Layer**: Fastify routes handle incoming REST requests, authenticate the user, and perform tier limit validations.
2. **Idempotency**: Redis is used for atomic `SET NX` locks to prevent duplicate session creations from concurrent double-clicks.
3. **Database**: Prisma acts as the ORM, utilizing `$transaction` blocks to atomically insert domain models (like `LabSession`) alongside `CoreOutboxEvent` records.
4. **Outbox Poller**: A background `setInterval` process queries `CoreOutboxEvent` (`WHERE processed = false AND failed = false`), locks rows using `FOR UPDATE SKIP LOCKED`, and dispatches them to Kafka and RabbitMQ. On repeated failures (>= 5 retries), failing events are flagged with `failed = true` to isolate poison-pills and prevent head-of-line blocking for subsequent events.

## 5. Changes made in this pass

- **Outbox Poller Partitioning & Poison-Pill Isolation**: `services/core/src/plugins/outbox-poller.ts` queries `CoreOutboxEvent` with `FOR UPDATE SKIP LOCKED`. Implements retry counting and dead-letter poison-pill isolation (`failed: true` after 5 attempts), preventing broken events from blocking queue processing.
- **Redis session-start lock TTL**: `services/core/src/modules/challenge/challenge.routes.ts` was updated to shorten the `SET NX` lock TTL from 60 minutes down to 10 seconds. This prevents hour-long deadlocks if the service crashes between lock acquisition and transaction commit.
- **Missing plan-tier concurrency limits**: `services/core/src/modules/challenge/challenge.routes.ts` now actively queries the user's `Org.planTier` and counts active `IN_PROGRESS` sessions. It accurately enforces limits (FREE=1, PRO=3, TEAM=5) and rejects requests with a 403 status if exceeded.

## 6. Known limitations

- **Reactive Death Detection**: As noted above, the system cannot proactively tear down `IN_PROGRESS` sessions if the underlying sandbox container crashes silently.
- **Delayed Provisioning UX**: Because broker failures are gracefully handled via the outbox (returning 200 before the sandbox is ready), the frontend must correctly poll or handle gateway 502s until the sandbox finishes provisioning.
