# Core Service Architecture

## 1. Corrections to Prior Documents

**a. Concurrency Plan Limits Do Not Exist**
`low_level_architecture.md` claimed that `POST /challenges/:id/start` queries `LabSession` to enforce plan-based concurrency limits (1 for Free, 3 for Pro, 5 for Team). A review of `services/core/src/modules/challenge/challenge.routes.ts` confirms this logic is **completely absent**. The route performs a Redis `SET NX` lock per-challenge but never queries existing `LabSession` counts or checks `Org.planTier`. The limit is "Proposed But Not Yet Implemented."

**b. Missing Health Proxy Route**
`low_level_architecture.md` claimed `GET /api/session/:id/health` proxies health checks to `sandbox-worker` synchronously. A review of `core-service` reveals **no such route exists**. The only health route is a global service-level `GET /health` (`src/utils/health.ts`).

---

## 2. Resolution of Outbox Poller Issues

**a. Cross-Contamination and Event Destruction**
Both `core-service` (`src/plugins/outbox-poller.ts`) and `auth-service` (`src/plugins/outbox.ts`) use `findMany({ where: { processed: false } })` to fetch events. Because neither filters by `eventType` and both share the `OutboxEvent` table, they cross-pollute.
Crucially, when `core-service` picks up an `auth-service` event (like `UserRegisteredEvent`), it fails to recognize the type, skips publishing, logs a warning, and **immediately sets `processed: true`**. This permanently destroys the event, ensuring it is never published to Kafka.

**b. Missing Row-Locking**
As suspected in `messaging.md`, neither poller uses `FOR UPDATE SKIP LOCKED`. Prisma's `findMany` is not a locking read. If multiple instances of `core-service` or `auth-service` run simultaneously, they will select the exact same rows. This guarantees race conditions leading to either duplicate Kafka emits or cross-service event destruction.

---

## 3. Service Responsibility Summary

`core-service` is the central orchestrator of the learning platform. It owns:

- **Content Delivery**: Serving the graph of Challenges, Nodes, and Quizzes (`/api/challenges`, `/api/nodes`, `/api/quizzes`).
- **Session Orchestration**: Creating session locks, allocating `LabSession` rows, and emitting reliable provisioning/termination events to RabbitMQ/Kafka.
- **Progress Tracking**: Consuming `CHALLENGE_SOLVED` and `CHALLENGE_FAILED` Kafka events to unlock new DAG nodes (creating `Completion` rows) and incrementing User XP.

---

## 4. Full Internal Structure

The `services/core/src` directory is structured by domain:

- **`modules/challenge/challenge.routes.ts`**: Routes for fetching challenges and orchestrating sandbox sessions (`POST /start`, `DELETE /session/:id`).
- **`modules/content/node.routes.ts`**: DAG traversal logic using Recursive CTEs for ancestors, children, and calculating the "frontier" of unlocked nodes.
- **`modules/content/quiz.routes.ts`**: Fetching quizzes and evaluating submitted answers to generate `Completion` records.
- **`modules/progress/consumers.ts`**: Kafka consumer group that listens for `CHALLENGE_SOLVED` and `CHALLENGE_FAILED`, handling XP increments and DB updates.
- **`plugins/outbox-poller.ts`**: Periodic background task to flush unsent `OutboxEvent` rows.
- **`plugins/metrics.ts`**: Prometheus metrics registry (counters for sessions and challenges).
- **`utils/health.ts`**: Implements the `GET /health` registry checking Postgres and Kafka readiness.

---

## 5. The Session-Start Flow (Fully Re-Traced)

When `POST /challenges/:id/start` is called:

1. **Redis `SET NX` Lock**:
   - Acquires `core:session:{userId}:{challengeId}` using `SET ... EX {ttl} NX`.
   - **TTL Danger**: The `EX` expiry is set to the full session duration (`fastify.sessionTTLMins * 60`). If the `core-service` node crashes _after_ acquiring the lock but _before_ committing the Prisma transaction, the lock remains held for the full duration (e.g., 60 minutes), permanently deadlocking that user from starting that challenge until expiry.
2. **Prisma Transaction Boundaries**:
   - Inside the `$transaction`: `LabSession.create` and `OutboxEvent.create`.
   - If this fails, a `catch` block explicitly calls `fastify.redis.del(lockKey)` to roll back the lock before returning 500.
3. **Plan-Tier Concurrency Limits**:
   - As noted in Corrections, this does not exist in the code.

---

## 6. Content Delivery Routes

`core-service` serves content via `/challenges`, `/nodes`, and `/quizzes`.

- **Caching Layer**: Absent. Every request executes a direct, synchronous query against the Postgres database (e.g., `prisma.challenge.findMany`, `prisma.$queryRaw` CTEs).
- _Proposed But Not Yet Implemented_: Any design documents mentioning a Redis-backed caching layer for the content-plane are unbuilt.

---

## 7. Session Lifecycle Beyond Creation

- **`DELETE /session/:id`**: Finds the `ACTIVE` session, updates it to `TERMINATED`, sets `endedAt`, and inserts a `SessionEndedEvent` payload to RabbitMQ/Kafka.
- **Mid-Session Death State**: As found in `sandboxservice.md`, sandbox-worker cannot detect if a container crashes mid-session. `core-service`'s `progress/consumers.ts` only listens to `CHALLENGE_SOLVED` and `CHALLENGE_FAILED`. Therefore, if a sandbox dies silently, the `LabSession.status` remains `ACTIVE` forever in Postgres (unless explicitly deleted by the user).
- **`GET /session/:id/health`**: Does not exist (see Corrections).

---

## 8. Auth / Authorization Enforcement

- **JWT Authentication**: Routes require auth via the `fastify.authenticate` middleware, which decodes the JWT and attaches claims to `req.user` (e.g., `req.user.sub` for `userId`).
- **Org-Scoping Authorization**: Completely absent at the application layer. `challenge.routes.ts` simply looks up the challenge ID without verifying if the requesting user belongs to the Organization that owns the challenge. It relies entirely on implicit lack of knowledge or downstream Postgres enforcement.

---

## 9. Open Questions / Unverified

- **Postgres Enum Casting**: (Carried forward) Raw SQL strings inserted into strict enum columns (`CheckStatus`) in `sandbox-worker` remain unverified at runtime.
- **Outbox Destruction Hotfix**: How should the `outbox-poller.ts` files be rewritten immediately to prevent the catastrophic cross-service deletion of events? Should `eventType` filtering be hardcoded, or should the outbox table be split per-service?
- **Active Session Zombie Cleanup**: Since mid-session sandbox deaths leave `LabSession` rows permanently `ACTIVE`, should `core-service` implement a background sweep based on the session's max TTL?
