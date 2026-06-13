# ADR 002: Async First (Kafka)

## Status
Accepted

## Why?
Challenge submissions are **jobs**, not requests. Expecting a user to wait 30 seconds for a container to boot, run code, and return a response over a single HTTP connection is a recipe for cascading timeouts. We need a system that handles spiky traffic without falling over.

## The Setup
- **Kafka (Redpanda)**: Single broker for all async communication — domain events and session lifecycle commands.
- **Consumer groups** provide queue semantics: sandbox-service uses group `sandbox-sessions` to consume `sandbox.session.started` and `sandbox.session.ended` topics, giving at-least-once delivery with automatic rebalancing.
- **Flow**: Core emits session events to Kafka; sandbox consumes them via consumer group. Results are broadcast via Kafka to all downstream consumers (progress, notifications).

## Tradeoffs
Eventual consistency is the price we pay. The UI won't update in the same millisecond, but the system won't die during a traffic spike.
