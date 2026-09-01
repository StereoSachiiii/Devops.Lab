# Messaging Architecture

## 1. Corrections to Prior Documents

**CRITICAL CORRECTION to low-level architecture:**
Both `high_level_architecture.md` and `low_level_architecture.md` state that `core-service`'s inline "best-effort" publish relies on the Outbox poller to retry delivery if the broker is down.
**This is factually incorrect based on the code.**
The underlying clients (`MessagingService.emit` and `RabbitMQService.publish` in `packages/messaging`) wrap their publish calls in a `try/catch`, log any errors to the console, and **swallow the error without throwing**.
As a result, `core-service`'s `POST /challenges/:id/start` receives a successful return from the publish functions even if the brokers are completely unreachable, and subsequently marks the `OutboxEvent` row as `processed: true`. If the brokers are down at the moment of the request, the message is permanently lost, bypassing the outbox safety net entirely.

---

## 2. Resolution of Prior Open Questions

**a. Is `curriculum.quiz.completed` actually used?**
**No, it is a dead topic.**
It is declared as a string constant in `packages/messaging/types.ts` (`TOPICS.QUIZ_COMPLETED`), but a search of the entire codebase confirms it has no corresponding typed event class in `EventClassMap`, and there is zero producer or consumer code that subscribes to or publishes this topic string directly.

**b. The Outbox Poller and Duplicate Deliveries**

- **Poller Query Mechanics:** The `startOutboxPoller` (`services/core/src/plugins/outbox-poller.ts`) uses a simple Prisma `findMany({ where: { processed: false }, take: 10 })`. It does **not** use row-level locking (e.g., `FOR UPDATE SKIP LOCKED`). Because it does not lock rows, it is entirely possible for the poller to pick up an event that is currently mid-flight in the inline publish path.
- **Consumer Idempotency:**
  - **`sandbox-worker`**: **Safe.** It checks its in-memory map of `sessionID` on `SessionStartedJob` delivery (`internal/session/manager.go`, line 59) and returns early if the session exists. It also syncs this map from Redis on startup, ensuring idempotency across restarts. Duplicate provisioning is prevented.
  - **`notification-service`**: **Unsafe.** It blindly calls `sendWelcomeEmail` upon processing the RabbitMQ job (`services/notification/src/consumers.ts`, line 38). There is no idempotency key check or deduplication. A duplicate delivery will result in the user receiving duplicate emails.

---

## 3. Topic & Queue Inventory

A cross-reference between infrastructure declarations (the `redpanda-init` script in `docker-compose.yml`) and application code (`packages/messaging/types.ts`).

| Entity Name                                                | Type           |  Configured in Infra  | Used in App Code  | Status                                                            |
| :--------------------------------------------------------- | :------------- | :-------------------: | :---------------: | :---------------------------------------------------------------- |
| `identity.user.registered`                                 | Kafka Topic    |  Yes (4 partitions)   |        Yes        | Active                                                            |
| `identity.email.verification` (or `identity.email.verify`) | Kafka Topic    | Yes (`.verification`) |  Yes (`.verify`)  | **MISMATCH**: Code uses `.verify`, Infra creates `.verification`. |
| `sandbox.session.started`                                  | Kafka Topic    |  Yes (8 partitions)   |        Yes        | Active                                                            |
| `sandbox.session.ended`                                    | Kafka Topic    |  Yes (8 partitions)   |        Yes        | Active                                                            |
| `sandbox.challenge.solved`                                 | Kafka Topic    |  Yes (4 partitions)   |        Yes        | Active                                                            |
| `sandbox.challenge.failed`                                 | Kafka Topic    |  Yes (4 partitions)   |        Yes        | Active                                                            |
| `curriculum.quiz.completed`                                | Kafka Topic    |          No           | Yes (String only) | **DEAD**: See section 2a.                                         |
| `provision.sandbox`                                        | RabbitMQ Queue |  N/A (Auto-declared)  |        Yes        | Active                                                            |
| `terminate.sandbox`                                        | RabbitMQ Queue |  N/A (Auto-declared)  |        Yes        | Active                                                            |
| `send.email`                                               | RabbitMQ Queue |  N/A (Auto-declared)  |        Yes        | Active                                                            |

_Note: RabbitMQ queues are auto-declared by the `RabbitMQService.assertQueueWithDLQ` function on first use, so they do not require an infra initialization script._

---

## 4. Producer / Consumer Map

| Topic/Queue                        | Producer(s)                                  | Consumer(s)            | Group / Bindings      | Delivery Guarantee & Retries                                                                                                                                                            |
| :--------------------------------- | :------------------------------------------- | :--------------------- | :-------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `identity.user.registered` (Kafka) | `auth-service`                               | `notification-service` | `group.notifications` | At-least-once. Consumer retries 3x linearly (1s, 2s, 3s) in-memory before manually publishing to `{topic}.dlq`.                                                                         |
| `identity.email.verify` (Kafka)    | `auth-service`                               | `notification-service` | `group.notifications` | Same as above.                                                                                                                                                                          |
| `sandbox.session.started` (Kafka)  | `core-service`                               | _(None currently)_     | N/A                   | N/A                                                                                                                                                                                     |
| `sandbox.session.ended` (Kafka)    | `core-service`                               | _(None currently)_     | N/A                   | N/A                                                                                                                                                                                     |
| `provision.sandbox` (RabbitMQ)     | `core-service`                               | `sandbox-worker`       | Direct queue routing  | At-least-once. Prefetch=1. If handler fails, `channel.nack(msg, false, false)` is called, which immediately pushes to `{queue}.dlq` via `x-dead-letter-exchange` (no local retry loop). |
| `terminate.sandbox` (RabbitMQ)     | `core-service`                               | `sandbox-worker`       | Direct queue routing  | Same as above.                                                                                                                                                                          |
| `send.email` (RabbitMQ)            | `notification-service` (Kafka consumer loop) | `notification-service` | Direct queue routing  | Same as above.                                                                                                                                                                          |

---

## 5. The Outbox Pattern Mechanics

Implemented in `core-service` and `auth-service` to bridge Postgres transactions and message brokers.

- **Schema:** `OutboxEvent` (id: String, eventType: String, payload: Json, processed: Boolean, createdAt: DateTime)
- **Poller Configuration (`services/core/src/plugins/outbox-poller.ts`)**:
  - Interval: `5000` ms (5 seconds).
  - Batch size: `10` rows.
  - Query: `WHERE processed = false ORDER BY createdAt ASC`.
- **Retry Behavior:**
  - If the poller successfully publishes to the brokers, it updates `processed: true`.
  - If the poller's publish attempt throws an error, it logs it and leaves `processed = false`. It will retry forever (every 5 seconds) until it succeeds. There is no maximum retry count or permanent failure state for outbox rows.
- **Flaw:** As noted in Section 1, because the messaging clients currently swallow publish errors instead of throwing them, the inline publish path marks events as `processed: true` even on failure, effectively bypassing this retry mechanism for all but completely asynchronous emissions.

---

## 6. Payload Schema Registry

Canonical types located in `packages/messaging/types.ts`. All events share a common wrapper: `{ topic: string, version: "1.0.0", timestamp: string, correlationId: string, payload: { ... } }`.
Below are the definitions for the inner `payload` objects.

| Event Type Name                   | Schema / Fields                                                                                                                                       |
| :-------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UserRegisteredEvent`             | `{ userId: string; email: string; name: string \| null; }`                                                                                            |
| `EmailVerificationRequestedEvent` | `{ userId: string; email: string; token: string; }`                                                                                                   |
| `ChallengeSolvedEvent`            | `{ submissionId: string; challengeId: string; userId: string; passed: true; stdout: string; stderr: string; exitCode: number; durationMs: number; }`  |
| `ChallengeFailedEvent`            | `{ submissionId: string; challengeId: string; userId: string; passed: false; stdout: string; stderr: string; exitCode: number; durationMs: number; }` |
| `SessionStartedEvent`             | `{ type: 'session.started'; sessionId: string; userId: string; challengeId: string; image: string; ttlMins: number; }`                                |
| `SessionEndedEvent`               | `{ type: 'session.ended'; sessionId: string; reason: 'completed' \| 'terminated' \| 'expired'; }`                                                     |
| `RabbitMQ send.email Job`         | `{ type: 'welcome' \| 'verification'; userId: string; email: string; token?: string; }`                                                               |

---

## 7. Failure Mode Inventory

**Kafka / Redpanda Broker Unreachable:**

- **On Publish:** `MessagingService.emit` wraps `producer.send` in a `try/catch`. It logs `[Kafka] emit failed for topic=...` and returns void without throwing an error. The calling application code assumes success.
- **On Consume:** Handled by `kafkajs` connection retry mechanics. If a single message handler throws, the `consume` wrapper catches it, sleeps `attempt * 1000`ms, and retries up to 3 times. On the 4th failure, it manually publishes the raw payload to `{topic}.dlq` using a new producer instance. If the DLQ publish fails, it throws a critical error.

**RabbitMQ Broker Unreachable:**

- **On Publish:** `RabbitMQService.publish` wraps `channel.sendToQueue` in a `try/catch`. It logs `[RabbitMQ] publish failed for queue=...` and returns void without throwing an error. The calling application code assumes success.
- **On Consume:** Handled by `amqplib` connection events. If the message handler throws, the library catches it and calls `channel.nack(msg, false, false)`. Because the queues are configured with `x-dead-letter-exchange`, RabbitMQ natively routes the rejected message to `{queue}.dlq`.

---

## 8. Open Questions / Unverified

- **Topic Name Mismatch**: Will `notification-service` ever receive verification emails? The `redpanda-init` script creates a topic named `identity.email.verification`, but the TypeScript code (`TOPICS.EMAIL_VERIFICATION_REQUESTED`) dictates `identity.email.verify`. `notification-service` binds to `.verify`, so it will fail to consume if auth-service publishes to the one provisioned by infra.
- **Client Error Swallowing**: Should the `emit` and `publish` methods in `@devops/messaging` be refactored to actually `throw err`? Currently, they silently break the Outbox pattern's fault tolerance guarantees.
