# DevOps.lab — Documentation Index

> Master sitemap for all project documentation. If you're new, start with the [Onboarding Guide](ONBOARDING.md).

---

## Getting Started

| Doc | What It Covers |
| :--- | :--- |
| [**Onboarding Guide**](ONBOARDING.md) | Prerequisites, first-time setup, understanding the system, env vars, making your first change, authoring challenges, database guide, testing, troubleshooting |
| [**Contributing Guide**](CONTRIBUTING.md) | Branch naming, commit conventions, PR requirements, engineering standards, review checklist |
| [**Local Dev Guide**](local-dev-guide.md) | Development workflows (`dev.sh`, `dev.sandbox.sh`, `dev.full.sh`), port allocations, memory profiles, E2E testing |

---

## Architecture

| Doc | What It Covers |
| :--- | :--- |
| [**High-Level Architecture**](high_level_architecture.md) | System overview, service inventory, external dependencies, inter-service dependency map, major request flows, deployment topology |
| [**Low-Level Architecture**](low_level_architecture.md) | Container provisioning mechanics, WebSocket/tmux terminal sessions, validator execution, outbox race conditions, message schemas |
| [**Database Schema Reference**](sqlschema.md) | Full SQL schema documentation |

---

## API & Contracts

| Doc | What It Covers |
| :--- | :--- |
| [**API Contract**](api-contract.md) | All REST endpoints (Auth, Core, Sandbox, Notification), request/response payloads, Kafka topics, RabbitMQ queues, security model |
| [**Core Service Contract**](coreservice-contract.md) | Core service-specific endpoint details |
| [**Auth Service Docs**](auth-service.md) | Auth service deep dive |
| [**Sandbox Service Spec**](sandbox-service-spec.md) | Sandbox service specification |
| [**Sandbox API Reference**](sandbox-api-reference.md) | Sandbox REST and WebSocket API |
| [**Sandbox SRS**](sandbox-srs.md) | Sandbox Software Requirements Specification |
| [**Messaging Guide**](messaging.md) | Event-driven messaging architecture details |

---

## Product & Requirements

| Doc | What It Covers |
| :--- | :--- |
| [**Product Features Spec**](product-features-spec.md) | Feature specifications and product roadmap |
| [**User Requirements**](user-requirements-doc.md) | Detailed user requirements document |
| [**B2B Product Requirements**](b2b-product-requirements.md) | Enterprise/B2B feature requirements (orgs, RBAC, SSO) |
| [**Gamification**](gamification.md) | XP, badges, leaderboards, streaks |

---

## Operations & Deployment

| Doc | What It Covers |
| :--- | :--- |
| [**Deployment Runbook**](deployment-runbook.md) | Tiered deployment procedure, secrets management, health gating, rollback |
| [**Production Runbook**](production_runbook.md) | Production operations procedures |
| [**Operations Runbook**](operations-runbook.md) | Incident response, alerting, monitoring dashboards |
| [**OAuth Setup**](oauth-setup.md) | Google and GitHub OAuth provider configuration |

---

## Quality & Audits

| Doc | What It Covers |
| :--- | :--- |
| [**Test Plan**](../TEST_PLAN.md) | E2E test scenarios (A–H), test environment setup, tooling |
| [**Frontend Code Quality Audit**](frontend_code_quality_audit.md) | Frontend code quality assessment |
| [**Completion Audit Backlog**](completion-audit-backlog.md) | Feature completion tracking and audit |
| [**Production Bug Report**](production_bug_report.md) | Documented production bugs and resolutions |

---

## Architectural Decision Records (ADRs)

Significant architectural choices are documented as ADRs in [`docs/adr/`](adr/):

| ADR | Decision |
| :--- | :--- |
| [001 — Monorepo Structure](adr/001-monorepo-structure.md) | npm workspaces + Turborepo for unified CI/CD and type safety |
| [002 — TypeScript Config](adr/002-aggressive-typescript-config.md) | Strict TypeScript without `any` |
| [002 — Event-Driven Architecture](adr/002-event-driven-architecture.md) | Kafka + RabbitMQ for async service decoupling |
| [003 — Observability](adr/003-observability.md) | OpenTelemetry + Pino + Prometheus + Grafana stack |
| [004 — Event Contracts](adr/004-event-contracts.md) | Typed event schemas in `@devops/messaging` |
| [005 — Row Level Security](adr/005-row-level-security.md) | Database-level access control patterns |
| [006 — Message Brokers & Caching](adr/006-message-brokers-and-caching.md) | Kafka for events, RabbitMQ for commands, Redis for caching |
| [007 — Firecracker MicroVMs](adr/007-firecracker-microvms.md) | Exploration of Firecracker for stronger isolation |
| [008 — VM Ownership](adr/008-vm-ownership.md) | Container/VM lifecycle ownership model |
| [009 — Hybrid Sandbox Strategy](adr/009-hybrid-sandbox-strategy.md) | Docker → gVisor → Firecracker progressive isolation |

---

## Infrastructure Config Reference

Key configuration files outside `docs/`:

| File | Purpose |
| :--- | :--- |
| [`infra/kong/kong.yml`](../infra/kong/kong.yml) | Kong API Gateway declarative route config |
| [`infra/prometheus.yml`](../infra/prometheus.yml) | Prometheus scrape targets and rules |
| [`infra/prometheus-alerts.yml`](../infra/prometheus-alerts.yml) | Prometheus alerting rules |
| [`infra/alertmanager.yml`](../infra/alertmanager.yml) | Alertmanager notification routing |
| [`infra/loki-config.yaml`](../infra/loki-config.yaml) | Grafana Loki log aggregation config |
| [`infra/tempo-config.yaml`](../infra/tempo-config.yaml) | Grafana Tempo distributed tracing config |
| [`infra/otel-config.yaml`](../infra/otel-config.yaml) | OpenTelemetry Collector pipeline config |
| [`turbo.json`](../turbo.json) | Turborepo task pipeline and caching config |
| [`docker-compose.yml`](../docker-compose.yml) | Full Docker Compose for all services |
| [`docker-compose.prod.yml`](../docker-compose.prod.yml) | Production-specific Docker Compose overrides |
| [`dev/docker-compose.dev.yml`](../dev/docker-compose.dev.yml) | Lightweight dev-only compose (Postgres + Redis) |
| [`dev/docker-compose.full.yml`](../dev/docker-compose.full.yml) | Full dev stack overlay (brokers + observability) |
