# ADR 002: Async First (Kafka & RabbitMQ)

## Status
Accepted

## Why?
Challenge submissions are **jobs**, not requests. Expecting a user to wait 30 seconds for a container to boot, run code, and return a response over a single HTTP connection is a recipe for cascading timeouts. We need a system that handles spiky traffic without falling over.

## The Setup
- **Kafka (Strimzi)**: Our replayable event log. Things that *happened* (e.g., `challenge.solved`).
- **RabbitMQ**: Our transactional task queue. Things that need *doing* (e.g., `sandbox.jobs`).
- **Flow**: Submissions go to RabbitMQ; results are broadcast via Kafka to all downstream consumers (progress, leaderboard, notifications).

## Tradeoffs
Eventual consistency is the price we pay. The UI won't update in the same millisecond, but the system won't die during a traffic spike.
