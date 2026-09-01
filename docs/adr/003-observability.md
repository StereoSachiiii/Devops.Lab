# ADR 003: Observability Stack Architecture & Telemetry Pipeline

## Status
Accepted (Audited & Verified August 2026)

## Context & Principles
In a distributed microservice and event-driven architecture, distributed tracing, metric scraping, and centralized log indexing are required to diagnose issues across service boundaries. However, local developer workflows must not be blocked or crash if telemetry backends are offline.

## Implemented Architecture & Signal Pipelines

### 1. Zero-Mandatory-Telemetry Resilience (Graceful Degradation)
* Telemetry backends (**Loki**, **Tempo**, **Prometheus**, **Grafana**, **Otel-Collector**) are **optional** during local execution.
* If `LOKI_URL` or `OTEL_TRACES_ENDPOINT` is offline, Node.js services (`@devops/observability`) fall back to stdout streaming (`pino.multistream([{ stream: process.stdout }])`) and silently discard trace export failures without blocking HTTP responses or crashing.
* Go services (`sandbox-worker`) output structured JSON logs to `stdout` and expose a standalone `/metrics` endpoint.

### 2. Signal Pipeline Breakdown (No Unintended Overlap)
* **Logs Pipeline**: Applications stream logs to stdout and push to `Loki` (`http://loki:3100`). `Promtail` scrapes container logs from `/var/run/docker.sock`.
  * *Known Open Redundancy*: In full Docker container runs, both `pino-loki` transport and `Promtail` ship container logs to Loki. (Status: **OPEN / UNRESOLVED**).
* **Traces Pipeline**: Node services emit OTLP traces to `otel-collector:4318`, which routes exclusively to `Tempo` (`http://tempo:3200`). `otel-collector` handles **traces only** in this stack.
* **Metrics Pipeline**: Prometheus scrapes `/metrics` endpoints directly on target service ports (`3002`, `3003`, `3004`, `8090`). `otel-collector` is not used for metrics; metrics are not double-counted.
* **Grafana Provisioning**: Exactly 3 data sources (`Prometheus`, `Loki`, `Tempo`) with trace-to-logs and service-map cross-linking.

### 3. Local Development vs Production Gating
* **Local Dev (`dev.sh`)**: Observability stack is **OFF by default** to minimize Docker RAM consumption (~105MB resting RAM).
* **Opt-In Telemetry (`dev.full.sh`)**: Spins up the full telemetry cluster when debugging distributed traces or metrics locally.
* **Production (`docker-compose.prod.yml`)**: Observability services run under the `observability` profile for production cluster monitoring.
