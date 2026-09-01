# Contributing Guide

## Local Development Workflow

The local development environment uses a tiered structure designed to minimize memory overhead while maintaining fast feedback and hot reloading:

### 1. Daily Development (`npm run dev`)
Starts only the lightweight databases in Docker (`PostgreSQL` on port `5444` and `Redis` on port `6379` ~105MB RAM total) and launches `web`, `auth-service`, `core-service`, and `notification-service` as host-native processes (`tsx watch` / Next.js Turbopack).
```bash
npm run dev
```

### 2. Opt-In Development Workflows

| Script | Purpose | What It Starts |
| :--- | :--- | :--- |
| `npm run dev:sandbox` *(Pending implementation)* | Interactive Sandbox Execution | Starts the host-native Go `sandbox-worker` daemon connected to host `/var/run/docker.sock`. |
| `npm run dev:full` *(Pending implementation)* | Full Event Broker & Observability Stack | Adds `Redpanda` (Kafka), `RabbitMQ`, `Otel-Collector`, `Loki`, `Tempo`, `Prometheus`, and `Grafana` to the running dev stack. |

---

## Engineering Standards

- **Type Safety**: Strict TypeScript without `any`. Define shared domain types in `packages/types` and contracts in `packages/contracts`.
- **Fault-Tolerant Telemetry**: All services must use `@devops/observability` and degrade gracefully to `stdout` if collectors or message brokers are unreachable.
- **Database Migrations**: Always run schema changes through `prisma migrate dev` or `prisma migrate deploy`. Migrations must be forward-only and idempotent.
- **Linting & Formatting**: Enforced via ESLint + Prettier. Run `npm run lint` and `npm run format:check` before pushing.
- **ADRs**: Major architectural changes require a documented record in `docs/adr/`.
