# Production Systems Bug Report: Status & Audit

Below is the verified audit and resolution status for the issues previously logged across the codebase.

---

## Resolved & Closed Issues

### 1. Outbox Event Destruction Race Condition
- **Status:** **RESOLVED**
- **Resolution:** Partitioned the shared `OutboxEvent` table into dedicated per-service models (`AuthOutboxEvent` and `CoreOutboxEvent`) with `FOR UPDATE SKIP LOCKED`. Data migration `packages/db/prisma/migrations/outbox_data_migration.sql` was applied and verified.

### 2. Client Error Swallowing Bypasses Outbox Safety Net
- **Status:** **RESOLVED**
- **Resolution:** `MessagingService.emit` (`packages/messaging/kafka.ts`) and `RabbitMQService.publish` (`packages/messaging/rabbitmq.ts`) now throw when connection or delivery fails. `core-service`'s `try/catch` block correctly leaves the outbox event as `processed: false` so the background outbox worker can retry.

### 3. Unenforced Plan-Tier Concurrency Limits
- **Status:** **RESOLVED**
- **Resolution:** `POST /challenges/:id/start` in `services/core/src/modules/challenge/challenge.routes.ts` queries the user's active session count and enforces plan limits (1 for Free, 3 for Pro, 5 for Team), returning 403 `CONCURRENCY_LIMIT_REACHED` when exceeded.

### 4. 60-Minute Session Deadlock on Transient Crash
- **Status:** **RESOLVED**
- **Resolution:** Lock TTL in `challenge.routes.ts` is reduced from 60 minutes to an acquisition TTL of 10 seconds (`EX 10`). In addition, `fastify.redis.del(lockKey)` is explicitly executed in the transaction error handler.

### 5. Zombie LabSessions on Container Death
- **Status:** **RESOLVED**
- **Resolution:** `POST /challenges/:id/start` validates container liveness with `sandbox-router` / `sandbox-worker` before returning existing sessions. Dead sessions are automatically marked as `TERMINATED`.

### 6. Org-Scoping Authorization Bypass
- **Status:** **RESOLVED**
- **Resolution:** `GET /challenges`, `GET /challenges/:id`, and `POST /challenges/:id/start` verify user organization ownership (`contributedByOrgId === userDb.orgId`), rejecting cross-organization attempts with `403 Forbidden`.

### 7. Validator Hang Resource Leak
- **Status:** **RESOLVED**
- **Resolution:** `Validator.Check` in `services/sandbox/internal/validator/validator.go` wraps execution in a `context.WithTimeout(ctx, 30*time.Second)`.

### 8. Notification Service Idempotency Failure (Duplicate Emails)
- **Status:** **RESOLVED**
- **Resolution:** `registerNotificationConsumers` in `services/notification/src/consumers.ts` uses Redis `SET NX` locks with a 24-hour TTL (`email:welcome:{userId}` and `email:verification:{userId}:{token}`) to deduplicate delivery.

### 9. Topic Name Mismatch & Sandbox DB Decoupling
- **Status:** **RESOLVED**
- **Resolution:** `TOPICS.EMAIL_VERIFICATION_REQUESTED` is unified to `"identity.email.verification"` in `packages/messaging/types.ts`. `sandbox-worker` communicates challenge results purely via Kafka event streams (`sandbox.challenge.solved` / `sandbox.challenge.failed`) and Redis rather than direct SQL writes to core tables.
