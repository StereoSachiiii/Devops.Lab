# ADR 006: Message Brokers and Caching Infrastructure (Master Reference)

## Status
Accepted

## Context
As our microservices architecture scales, services must communicate asynchronously, process background jobs reliably, and enforce security policies (like rate limiting) with extremely low latency.

## Decision
We use Kafka for all async communication and Redis for ephemeral state. The `@devops/messaging` package abstracts Kafka to ensure type-safe, standardized implementations across the monorepo.

### 1. Kafka (Redpanda): The Event Stream
**Use Case:** Domain events, session lifecycle commands, and broadcasts.
**Implementation:** `packages/messaging/kafka.ts` (`MessagingService`)
- **How we use it:** All async communication flows through Kafka — from `UserRegisteredEvent` broadcasts to `SessionStartedEvent`/`SessionEndedEvent` commands consumed by sandbox via consumer group `sandbox-sessions`.
- **Why:** Kafka provides replayability, ordered event streams, consumer groups for queue semantics, and high-throughput log append semantics — all in one broker.
- **Rule of thumb:** If a service needs to know something happened or needs to do work asynchronously, use Kafka.

### 2. Redis: The In-Memory Cache & State Store
**Use Case:** Ephemeral State, Rate Limiting, Session Store.
**Implementation:** `services/auth/src/plugins/redis.ts` (via `@fastify/redis`), sandbox session store.
- **How we use it:** Used for extremely fast, temporary data storage where database disk I/O would be a bottleneck. Powers Auth service brute-force protection and sandbox session-to-container mapping.
- **Why:** In-memory, sub-millisecond read/write speeds.
- **Rule of thumb:** If you need to store temporary state, enforce API rate limits, or cache slow database queries, use Redis.

## Consequences
**Pros:**
- Single broker simplifies operations — no dual-broker management.
- Consumer groups give us the same reliable work queue semantics as a dedicated task queue, with the added benefit of event replay.
- The `EventClassMap` and base classes provide strict TypeScript safety across boundaries.

**Cons:**
- Kafka consumer groups add slight complexity vs push-based queues for work distribution, but the operational simplicity of a single broker outweighs this.
- Steeper learning curve for new developers navigating the `@devops/messaging` abstraction.
