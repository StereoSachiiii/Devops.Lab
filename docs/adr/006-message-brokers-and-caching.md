# ADR 006: Message Brokers and Caching Infrastructure (Master Reference)

## Status
Accepted

## Context
As our microservices architecture scales, services must communicate asynchronously, process background jobs reliably, and enforce security policies (like rate limiting) with extremely low latency. 

A single "silver bullet" infrastructure component cannot efficiently handle all these distinct workload patterns. For example, using Redis for durable task queues is risky, and using Kafka for simple 1-to-1 task execution adds unnecessary overhead. We need a clear, master reference for when to use which infrastructure tool.

## Decision
We will employ a polyglot infrastructure approach. The `@devops/messaging` package abstracts these tools to ensure type-safe, standardized implementations across the monorepo.

### 1. Kafka: The Event Stream (Pub/Sub)
**Use Case:** Domain Events, Broadcasts, and Event Sourcing.
**Implementation:** `packages/messaging/kafka.ts` (`MessagingService`)
- **How we use it:** Used when an event (e.g., `UserRegisteredEvent`) needs to be broadcasted to *multiple* independent services (e.g., Notification Service, Progress Service). 
- **Why:** Kafka provides replayability, ordered event streams, and high-throughput log append semantics. 
- **Rule of thumb:** If multiple consumers care about something that "happened in the past", use Kafka.

### 2. RabbitMQ: The Task Queue
**Use Case:** Directed Commands, Background Jobs, and Work Queues.
**Implementation:** `packages/messaging/rabbitmq.ts` (`RabbitMQService`)
- **How we use it:** Used when a specific task needs to be executed *exactly once* by a worker (e.g., evaluating a user's code submission in the Challenge Service).
- **Why:** RabbitMQ provides precise message acknowledgment routing (`ack`/`nack`). If a worker fails or crashes mid-task, the message is safely re-queued.
- **Rule of thumb:** If Service A needs Service B to "do a specific task", use RabbitMQ.

### 3. Redis: The In-Memory Cache & State Store
**Use Case:** Ephemeral State, Rate Limiting, Brute-Force Lockouts.
**Implementation:** `services/auth/src/plugins/redis.ts` (via `@fastify/redis`)
- **How we use it:** Used for extremely fast, temporary data storage where database disk I/O would be a bottleneck. Currently powers the Auth service's brute-force protection mechanism (tracking failed logins).
- **Why:** In-memory, sub-millisecond read/write speeds.
- **Rule of thumb:** If you need to store temporary state, enforce API rate limits, or cache slow database queries, use Redis.

## Consequences
**Pros:**
- We use the right tool for the job, preventing architectural anti-patterns.
- High resilience: A backlog of background jobs (RabbitMQ) won't slow down the real-time event stream (Kafka).
- The `EventClassMap` and base classes provide strict TypeScript safety across boundaries.

**Cons:**
- Increased operational complexity (we now have to manage Kafka/Zookeeper, RabbitMQ, and Redis in our Docker Compose and production environments).
- Steeper learning curve for new developers navigating the `@devops/messaging` abstraction.
