# Contributing Guide

> How to write code, submit changes, and get them merged.

---

## Branch Workflow

### Branch Naming

| Type | Convention | Example |
| :--- | :--- | :--- |
| Feature | `feat/<short-description>` | `feat/challenge-editorial` |
| Bug fix | `fix/<short-description>` | `fix/outbox-race-condition` |
| Service-scoped | `services-<service>/<description>` | `services-auth/mfa-totp` |
| Docs | `docs/<description>` | `docs/onboarding-guide` |
| Infra | `infra/<description>` | `infra/kong-rate-limit-config` |

### Git Flow

1. Branch from `main`
2. Make your changes
3. Run quality checks locally (see [Pre-Push Checklist](#pre-push-checklist))
4. Open a PR targeting `main`
5. CI runs automatically on PRs (lint, typecheck, test — affected packages only)
6. Get review approval
7. Squash-merge to `main`

---

## Commit Conventions

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short description>

[optional body]
[optional footer]
```

**Types:** `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`, `perf`

**Scopes:** `auth`, `core`, `sandbox`, `notification`, `web`, `db`, `messaging`, `observability`, `infra`, `docs`

**Examples:**
```
feat(core): add editorial unlock gating behind challenge solve
fix(auth): handle concurrent refresh token rotation within grace period
docs: add onboarding guide for new engineers
chore(db): add index on LabSession(userId, status)
```

---

## Pre-Push Checklist

Before pushing your branch, run these locally:

```bash
# 1. Lint affected workspaces
npm run lint

# 2. Check formatting
npm run format:check

# 3. Fix formatting issues (if any)
npm run format

# 4. Ensure shared packages compile
npm run build:packages

# 5. Ensure Prisma client is up-to-date (if you changed schema.prisma)
npm run db:generate
```

---

## Pull Request Requirements

### PR Title
Follow the same commit convention format: `type(scope): description`

### PR Description Must Include
- **What**: What the change does
- **Why**: Why it's needed (link to issue if applicable)
- **How**: Brief technical approach
- **Testing**: How you verified it works (commands run, scenarios tested)

### Review Expectations
- At least **1 approval** required
- CI must pass (lint, typecheck, test)
- No `any` types in TypeScript (strict mode)
- New API endpoints must be added to `infra/kong/kong.yml` if they need gateway exposure
- Database schema changes must include migration reasoning

---

## Engineering Standards

### Type Safety
- **Strict TypeScript** across all workspaces. No `any`.
- Define shared domain types in `packages/types`
- Define API contracts in `packages/contracts`
- Use Prisma's generated types for all database operations

### Observability
- All Node.js services must initialize via `initObservability()` from `@devops/observability`
- Services must degrade gracefully if Loki, OTel collectors, or message brokers are unreachable
- Use structured logging (Pino) — not `console.log`

### Database
- Schema changes go through `packages/db/prisma/schema.prisma`
- Always run `npm run db:generate` after schema changes
- Migrations must be **forward-only** and **idempotent**
- Never run destructive migrations in production without a rollback plan

### Messaging
- Use the typed event classes from `@devops/messaging` — don't create ad-hoc payloads
- Follow the outbox pattern for any new event publishing (write outbox row + inline publish + poller backup)
- New Kafka topics must be added to the `redpanda-init` script in `docker-compose.yml`

### Linting & Formatting
- ESLint config lives in `packages/eslint-config/`
- Prettier config lives in `.prettierrc` at the root
- Both are enforced in CI

### ADRs (Architectural Decision Records)
- Major architectural changes require a documented ADR in `docs/adr/`
- Use the existing ADR format: Status, Why, Setup, Tradeoffs
- Number sequentially (e.g., `010-your-decision.md`)

---

## Local Development Workflows

The local dev environment uses a tiered structure to minimize memory while maintaining hot reload:

### Default: `npm run dev` (~105 MB Docker)
Starts Postgres + Redis in Docker, runs web + auth + core + notification on the host.

### Sandbox Development: `npm run dev:sandbox`
Adds the Go sandbox worker daemon connected to the host Docker socket.

### Full Stack: `npm run dev:full` (~4.4 GB Docker)
Adds Redpanda (Kafka), RabbitMQ, and the full observability stack (Prometheus, Loki, Tempo, Grafana, OTel Collector).

See [Local Dev Guide](local-dev-guide.md) for detailed port maps, memory profiles, and troubleshooting.

---

## Adding a New Service

If you need to add a new microservice:

1. Create the directory under `services/<name>/`
2. Add it to the root `package.json` workspaces (already covered by `services/*` glob)
3. Import shared packages: `@devops/db`, `@devops/observability`, `@devops/messaging`, `@devops/types`
4. Add routes to `infra/kong/kong.yml` for gateway exposure
5. Add the service to `dev/dev.sh` for local development
6. Add health check endpoint at `GET /health`
7. Add the service to `docker-compose.yml` and `docker-compose.prod.yml`
8. Update `deploy.sh` tier assignments
9. Document in an ADR if it represents a significant architectural change
