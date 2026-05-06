# ADR 003: Observability or Death

## Status
Accepted

## Why?
In a distributed, event-driven system, you are blind without tracing. If a `challenge.solved` event disappears, you need to know exactly where it died. Since we are a DevOps platform, our own observability stack is also a key part of the curriculum.

## The Setup
- **OpenTelemetry (OTel)**: Standard instrumentation for all services.
- **Grafana Stack**: Loki for logs, Tempo for traces, and Prometheus for metrics.
- **Correlation**: Every request and event carries a trace ID through the entire system.

## Tradeoffs
It's more work up front to instrument every service, but it's the only way to sleep at night when handling 10k concurrent users.
