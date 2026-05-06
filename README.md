# DevOps Learning Platform

A production-grade, open-source learning platform for mastering DevOps at scale. This platform is built to simulate real-world engineering environments, utilizing a microservices architecture, event-driven patterns, and industry-standard observability.

---

## Core Principles
- **Async Domain**: Event-driven architecture for high-latency tasks (sandboxes).
- **Service Sovereignty**: Each service owns its data; no cross-service DB queries.
- **Infrastructure is Curriculum**: The platform's tech stack is a learning surface for users.
- **Spike-Ready**: Built for massive concurrent traffic bursts.

---

## Application Services

### `web` (Next.js 14)
- **Frontend & BFF**: App Router, RSC, and Client Components.
- **Interactive UI**: Monaco Editor (Code) & xterm.js (Terminal).
- **Auth**: Auth.js (GitHub/Google) via httpOnly JWT cookies.
- **Real-time**: WebSockets to `sandbox-service` for execution output.

### `api-gateway` (Kong OSS)
- **Ingress**: Single entry point for all backend traffic.
- **Security**: JWT validation and per-user/IP rate limiting.

### `challenge-service` (Node/TS)
- **Domain**: Challenge content and submission lifecycle.
- **Storage**: Postgres via Prisma.
- **Events**: Publishes `challenge.submitted`, consumes `sandbox.completed`.

### `sandbox-service` (Go)
- **Execution**: Runs user code in ephemeral gVisor-isolated containers.
- **Limits**: Hard resource caps (0.5 CPU, 256MB RAM, 30s timeout).
- **Output**: Real-time stdout/stderr streaming via WebSockets.

### `simulation-service` (Go)
- **Environments**: Provisions virtual K8s clusters per session via `vcluster`.
- **Scenario**: Pre-seeds broken configs for troubleshooting challenges.

### `progress-service` (Node/TS)
- **Tracking**: Single source of truth for XP, streaks, and badges.
- **Cache**: Invalidates Redis leaderboard snapshots on update.

---

## Messaging Architecture

### Kafka (Event Bus)
Replayable event log for platform-wide facts.
- `challenge.submitted` -> `sandbox-service`
- `challenge.solved` -> `progress-service`, `notification-service`
- `quiz.completed` -> `progress-service`
- `user.registered` -> `notification-service`

### RabbitMQ (Task Queues)
Broker-driven, transactional jobs.
- `sandbox.jobs`: Sandbox execution dispatch.
- `email.jobs`: Async notification delivery.
- `content.review`: Contributor workflow queue.

---

## Data Architecture

- **PostgreSQL (Neon)**: Per-service schemas (users, challenges, progress, etc.).
- **PgBouncer**: Transaction-mode connection pooling.
- **Redis**: Sessions, leaderboard sorted sets, and rate limit counters.
- **Cloudflare R2**: Object storage for challenge assets and execution logs.

---

## Infrastructure & Observability

### Stack
- **Orchestration**: Kubernetes (GKE/EKS) managed via ArgoCD (GitOps).
- **IaC**: Terraform and Helm charts per service.
- **Observability**: Prometheus (Metrics), Tempo (Traces), Loki (Logs), and Grafana dashboards.

### CI/CD
- **PR Workflow**: Lint -> Typecheck -> Test -> Neon DB Branch -> Trivy Scan.
- **Merge to Main**: Build Image -> GHCR -> ArgoCD Sync -> Helm Deployment.

---

## Monorepo Structure
```bash
/
├── apps/web              # Next.js Frontend
├── services/             # Domain microservices (Node/Go)
├── packages/             # Shared types, messaging, and DB clients
├── infra/                # Terraform, Helm, and ArgoCD manifests
└── docs/adr              # Architecture Decision Records
```
