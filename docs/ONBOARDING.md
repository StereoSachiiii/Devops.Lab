# Onboarding Guide

> You just cloned the repo. This doc takes you from zero to running, understanding, and contributing.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [First-Time Setup](#2-first-time-setup)
3. [Understanding the System](#3-understanding-the-system)
4. [Shared Packages (`packages/*`)](#4-shared-packages)
5. [Environment Variables Reference](#5-environment-variables-reference)
6. [Making Your First Change](#6-making-your-first-change)
7. [Authoring Challenges](#7-authoring-challenges)
8. [Database Guide](#8-database-guide)
9. [Testing](#9-testing)
10. [Troubleshooting & Common Pitfalls](#10-troubleshooting--common-pitfalls)
11. [Where to Go Next](#11-where-to-go-next)

---

## 1. Prerequisites

### Required Software

| Tool | Version | Why |
| :--- | :--- | :--- |
| **Node.js** | 20+ | Runtime for all TypeScript services and the Next.js frontend |
| **npm** | 10+ | Package manager; monorepo workspace orchestration |
| **Docker Desktop** | Latest | Runs Postgres, Redis, and sandbox challenge containers |
| **Git** | 2.40+ | Source control |

### Windows-Specific Requirements

> [!IMPORTANT]
> This project runs Docker commands via **WSL2**. The `npm run` scripts use `wsl docker compose`, which means Docker Desktop must be configured with the WSL2 backend enabled.

1. Install [Docker Desktop for Windows](https://docs.docker.com/desktop/install/windows-install/) with **WSL2 backend** enabled.
2. In Docker Desktop → Settings → Resources → WSL Integration, enable your default distro.
3. Verify it works:
   ```powershell
   wsl docker compose version
   # Should print: Docker Compose version v2.x.x
   ```

### Optional (For Sandbox Worker Development)

| Tool | Version | Why |
| :--- | :--- | :--- |
| **Go** | 1.22+ | The `sandbox-worker` service is written in Go |
| **gVisor (runsc)** | Latest | Required only for gVisor-secured sandbox execution |

---

## 2. First-Time Setup

### Step 1: Clone and Install

```bash
git clone <repository-url>
cd devops-learning-platform

# Install all workspace dependencies (apps, services, packages)
npm install
```

This single `npm install` at the root resolves dependencies for **all** workspaces: `apps/web`, `services/auth`, `services/core`, `services/notification`, and all `packages/*`.

### Step 2: Environment Configuration

The repo includes a `.env` file at the root with development-safe defaults. **You do not need to create or modify it** for standard local development. It contains:

- Database connection strings pointing to `localhost:5444`
- Development JWT keys (RSA keypair, pre-generated)
- Dummy third-party API keys that won't make real external calls
- All service port assignments

> [!NOTE]
> There is also a `.env.prod` for production deployments. **Never commit it.** See [docs/deployment-runbook.md](deployment-runbook.md) for production secrets.

### Step 3: Build Shared Packages

Before services can run, the shared internal packages need to be compiled:

```bash
npm run build:packages
```

This compiles `@devops/observability` and `@devops/messaging` into their `dist/` folders. Services depend on these compiled outputs at runtime.

### Step 4: Generate Prisma Client

```bash
npm run db:generate
```

This generates the TypeScript Prisma Client from `packages/db/prisma/schema.prisma`. All Node.js services (`auth`, `core`, `notification`) import the client from `@devops/db`.

### Step 5: Start the Dev Environment

```bash
npm run dev
```

This runs `dev/dev.sh`, which:
1. Starts **Postgres** (port `5444`) and **Redis** (port `6379`) in Docker containers (~105 MB total)
2. Waits for both containers to report healthy
3. Builds shared packages
4. Launches all four application services with hot reload:
   - `apps/web` — Next.js with Turbopack on `http://localhost:3000`
   - `services/auth` — tsx watch on `http://localhost:3002`
   - `services/core` — tsx watch on `http://localhost:3003`
   - `services/notification` — tsx watch on `http://localhost:3004`

### Step 6: Push the Database Schema

On first run, the database will be empty. Push the Prisma schema to create all tables:

```bash
npm run db:push
```

### Step 7: Verify

Open `http://localhost:3000` in your browser. You should see the DevOps.lab dashboard.

---

## 3. Understanding the System

### What Does This Platform Do?

DevOps.lab lets users practice real infrastructure troubleshooting. The flow:

1. **User authenticates** → Auth Service issues RS256 JWTs with JTI-based revocation
2. **User picks a challenge** → Core Service looks up the challenge definition (which Docker image, what XP, etc.)
3. **User starts a session** → Core Service writes an outbox event and publishes to RabbitMQ
4. **Sandbox Worker provisions an environment** → Dynamically selects the runtime backend per challenge based on `requiredProvider` (with multi-provider registry routing):
   - **`docker`** (Default dev): Fast native Docker container (`runc`) with capability drops.
   - **`gvisor`** (`runsc`): User-space Go kernel intercepting syscalls.
   - **`kata`** (`kata-fc` / `kata-qemu`): Lightweight hardware VM per container via KVM and Firecracker/QEMU.
   - **`flintlock`**: Direct Firecracker MicroVM managed via LiquidMetal Flintlock gRPC with SSH PTY bridges.
   All providers implement the unified `SandboxProvider` interface (`internal/sandbox/provider.go`).
5. **User gets a live terminal** → WebSocket connection proxied through Kong → Sandbox Worker → tmux session inside the container/microVM (with real-time WebSocket progress frames during image pull and container boot).
6. **User fixes the problem and clicks "Check"** → Sandbox Worker runs `/validator.sh` inside the container and parses the JSON output
7. **Results published to Kafka** → Core Service updates XP, leaderboard, badges

### The Outbox Pattern (Critical to Understand)

Services **never** publish directly to Kafka/RabbitMQ as the first step. Instead:

1. A database transaction writes the business data **and** an outbox event row atomically
2. An inline best-effort publish is attempted immediately
3. If the broker is down, a background outbox poller (`OUTBOX_INTERVAL_MS=2000`) picks up unprocessed rows and retries

This guarantees **at-least-once delivery** even during broker outages. You'll see `AuthOutboxEvent` and `CoreOutboxEvent` tables in the Prisma schema, and outbox poller plugins in both services.

### Service Communication Map

```
Browser ──HTTP──▶ Kong Gateway ──routes──▶ Auth Service     (POST /api/auth/*)
                                         ▶ Core Service     (GET/POST /api/challenges/*, /api/session/*)
                                         ▶ Sandbox Worker   (WS /sessions/*/terminal, POST /validate/*)

Auth Service    ──Kafka──▶ Notification Service   (user.registered, email.verify)
Core Service    ──Kafka──▶ Sandbox Worker          (session.started, session.ended)
Core Service    ──RabbitMQ──▶ Sandbox Worker        (provision.sandbox, terminate.sandbox)
Auth Service    ──RabbitMQ──▶ Notification Service  (send.email)
Sandbox Worker  ──Kafka──▶ Core Service            (challenge.solved, challenge.failed)
```

### Security Model

- **JWT**: RS256 asymmetric signing. 15-minute access tokens with unique `jti` claims.
- **Token Revocation**: On logout, the `jti` is added to a Redis denylist (`auth:denylist:jti:<jti>`) with 15-min TTL.
- **Refresh Token Rotation**: Tokens rotate on use with a 10-second grace period for concurrent requests. Reuse outside the window triggers `SESSION_COMPROMISED` and revokes all sessions.
- **Sandbox Fail-Open**: The Go sandbox worker checks the Redis denylist with a 250ms timeout. If Redis is unreachable, it allows valid RS256 signatures through to protect active terminal sessions.

---

## 4. Shared Packages

The `packages/` directory contains shared libraries used across all services. Understanding these is critical — they're the backbone of the monorepo.

### `@devops/db` — Database Layer

**Path:** `packages/db/`

The single source of truth for the database schema. Contains:
- `prisma/schema.prisma` — The complete Prisma schema (718 lines, 30+ models)
- Generated Prisma Client consumed by auth, core, and notification services

All three Node.js services share the **same Postgres database** and the **same `public` schema**. The Go sandbox worker also writes to the same schema via raw SQL (`sqlx`).

**Key models to know:**
| Model | Purpose |
| :--- | :--- |
| `User` | Central user record — auth, XP, streaks, social graph, org membership |
| `Challenge` | Challenge definition — title, Docker image, difficulty, XP, editorial |
| `LabSession` | Active/completed sandbox sessions linking users to challenges |
| `Submission` | Code submissions and their grading results |
| `ChallengeCheckResult` | Per-check validator results (survives sandbox crashes) |
| `AuthOutboxEvent` / `CoreOutboxEvent` | Transactional outbox tables for reliable event publishing |
| `UserSession` | Auth session tracking with `tokenHash` for targeted revocation |
| `Org` / `OrgMember` / `OrgInvite` | B2B multi-tenancy — organizations, roles (OWNER/ADMIN/MEMBER), invite flow |
| `Badge` / `UserBadge` | Gamification — achievement badges earned by users |
| `Node` / `Edge` | Knowledge graph for learning paths (concept → scenario → quiz) |

**Running migrations:**
```bash
# Development — push schema changes directly (no migration files)
npm run db:push

# Production — create and apply versioned migration files
npx prisma migrate dev --schema=packages/db/prisma/schema.prisma
```

---

### `@devops/messaging` — Kafka & RabbitMQ Wrappers

**Path:** `packages/messaging/`

Provides typed wrappers for both messaging platforms:
- `kafka.ts` — Producer and consumer classes with automatic topic routing and serialization
- `rabbitmq.ts` — Publisher and consumer with queue declaration and retry logic
- `types.ts` — Canonical event type definitions (`UserRegisteredEvent`, `SessionStartedEvent`, etc.)

**Key Kafka topics:**
| Topic | Publisher | Consumer |
| :--- | :--- | :--- |
| `identity.user.registered` | Auth (Outbox) | Notification |
| `identity.email.verification` | Auth (Outbox) | Notification |
| `sandbox.session.started` | Core | Sandbox |
| `sandbox.session.ended` | Sandbox, Core | Progress |
| `sandbox.challenge.solved` | Sandbox | Core |
| `sandbox.challenge.failed` | Sandbox | Core |

**Key RabbitMQ queues:**
| Queue | Publisher | Consumer |
| :--- | :--- | :--- |
| `provision.sandbox` | Core | Sandbox |
| `terminate.sandbox` | Core | Sandbox |
| `send.email` | Auth (Outbox) | Notification |

---

### `@devops/observability` — Logging, Tracing, Metrics

**Path:** `packages/observability/`

Every Node.js service initializes observability via:
```typescript
import { initObservability } from '@devops/observability';
const { logger, loggerOptions, stream } = initObservability('my-service');
```

This sets up:
- **Pino logging** → stdout + file (`logs/<service>.log`) + Loki (if available)
- **OpenTelemetry tracing** → Exports to the OTLP collector endpoint
- **Prometheus metrics** → Custom counters and histograms (login attempts, request duration)
- **Graceful degradation** → If Loki/OTel collectors are unreachable, falls back to local stdout/file

All log entries are automatically enriched with `trace_id` and `span_id` from the active OpenTelemetry span.

---

### `@devops/types` — Shared Domain Types

**Path:** `packages/types/`

TypeScript interfaces and types shared across frontend and backend: `User`, `Challenge`, `Session`, `Submission`, `LeaderboardEntry`, `OrgDetails`, etc.

---

### `@devops/contracts` — API Contracts

**Path:** `packages/contracts/`

OpenAPI specification (`openapi.yaml`) and generated TypeScript types for strict API contract enforcement.

---

### `@devops/eslint-config` — Shared Linting

**Path:** `packages/eslint-config/`

Common ESLint configuration extended by all TypeScript workspaces.

---

## 5. Environment Variables Reference

The root `.env` file contains all configuration. Here's what every variable does:

### Database & Caching
| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `DATABASE_URL` | `postgresql://postgres:postgres@127.0.0.1:5444/appdb?schema=public` | Postgres connection string |
| `REDIS_URL` | `redis://127.0.0.1:6379` | Redis connection string |

### Authentication & Cryptography
| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `JWT_SECRET` | `dev-jwt-secret-key-change-in-prod` | Legacy symmetric JWT secret (kept for compatibility) |
| `JWT_PRIVATE_KEY` | Pre-generated RSA key | RS256 private key for signing access tokens |
| `JWT_PUBLIC_KEY` | Pre-generated RSA key | RS256 public key for verifying tokens (used by all services) |
| `ENCRYPTION_KEY` | Pre-generated AES key | 32-byte Base64 AES key for encrypting sandbox state |
| `JWT_ISSUER` | `devops-platform` | `iss` claim in signed JWTs |
| `EXPIRY_MFA_TOKEN` | `5m` | MFA challenge token lifetime |
| `DEFAULT_USER_ROLE` | `LEARNER` | Role assigned to newly registered users |

### OAuth Providers
| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Dev credentials | Google OAuth2 flow |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | `dummy_*` | GitHub OAuth flow |

### Service Ports
| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `WEB_FRONTEND_PORT` | `3000` | Next.js frontend |
| `AUTH_SERVICE_PORT` | `3002` | Auth service |
| `CORE_SERVICE_PORT` | `3003` | Core service |
| `NOTIFICATION_SERVICE_PORT` | `3004` | Notification service |
| `SANDBOX_WORKER_PORT` | `8090` | Go sandbox worker |
| `API_GATEWAY_PORT` | `8005` | Kong proxy port |
| `POSTGRES_PORT` | `5444` | Postgres (non-standard to avoid conflicts) |
| `REDIS_PORT` | `6379` | Redis |

### Messaging Brokers
| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `KAFKA_BROKERS` | `localhost:19092` | Redpanda/Kafka bootstrap servers |
| `KAFKA_CLIENT_ID` | `sandbox-worker` | Kafka client identifier |
| `KAFKA_GROUP_ID` | `sandbox-sessions` | Kafka consumer group |
| `RABBITMQ_URL` | `amqp://guest:guest@localhost:5672` | RabbitMQ connection string |

### Sandbox Configuration
| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `SESSION_TTL_MINS` | `60` | Default session timeout in minutes |
| `MAX_MEMORY_MB` | `512` | Memory limit per sandbox container |
| `MAX_CPUS` | `1.0` | CPU limit per sandbox container |
*(Runtime backend is dynamically selected per challenge from `docker`, `gvisor`, `kata`, or `flintlock`)*

### Observability
| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `LOG_LEVEL` | `info` | Pino log level (`debug`, `info`, `warn`, `error`) |
| `LOG_DIR` | `logs` | Directory for log files |
| `LOKI_URL` | `http://localhost:3100` | Grafana Loki endpoint |
| `OTEL_TRACES_ENDPOINT` | `http://localhost:4318/v1/traces` | OpenTelemetry collector OTLP endpoint |

### External APIs
| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `GEMINI_API_KEY` | Dev key | Google Gemini API for the AI assistant feature |
| `RESEND_API_KEY` | `dummy_resend_key` | Resend email API (dummy in dev = no real emails) |

### Application URLs
| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `FRONTEND_URL` | `http://localhost:3000` | Used for CORS and email links |
| `BASE_URL` | `http://localhost:3002` | Auth service base URL for OAuth callbacks |
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:8005` | Frontend → Kong API gateway URL |
| `PUBLIC_GATEWAY_URL` | `http://localhost:8005` | Public-facing gateway URL |
| `CORS_ORIGIN` | `http://localhost:3000,http://127.0.0.1:3000` | Allowed CORS origins |
| `OUTBOX_INTERVAL_MS` | `2000` | Background outbox poller interval |

---

## 6. Making Your First Change

### Adding a New API Endpoint to Core Service

1. **Define the route** in `services/core/src/modules/<feature>/<feature>.routes.ts`
2. **Use shared types** from `@devops/types` for request/response schemas
3. **Use Prisma client** from `@devops/db` for database operations
4. **Emit events** via `@devops/messaging` if the action has downstream side effects
5. **Add the route to Kong** in `infra/kong/kong.yml` if it needs gateway exposure

Example file structure for a new feature:
```
services/core/src/modules/
├── challenge/
│   ├── challenge.routes.ts      # Route handlers
│   └── challenge.service.ts     # Business logic (optional)
├── your-feature/
│   ├── your-feature.routes.ts   # Your new routes
│   └── your-feature.service.ts
```

### Adding a New Shared Type

1. Add the type definition in `packages/types/index.ts`
2. It's immediately available to all workspaces as `@devops/types`
3. No build step needed — types are imported directly from source

### Database Schema Changes

1. Edit `packages/db/prisma/schema.prisma`
2. Regenerate the Prisma client:
   ```bash
   npm run db:generate
   ```
3. Push to local dev database:
   ```bash
   npm run db:push
   ```
4. For production, create a proper migration:
   ```bash
   npx prisma migrate dev --schema=packages/db/prisma/schema.prisma --name your_migration_name
   ```

---

## 7. Authoring Challenges

Challenges live in the `challenges/` directory, organized by sandbox provider:

```
challenges/
├── docker/               # Standard Docker-based challenges
│   ├── nginx-basics/     # Example: Fix a broken nginx config
│   ├── linux-basics/     # Example: User groups, permissions, cron
│   ├── bash-scripting/
│   ├── git-basics/
│   └── nginx-syntax-fix/
├── gvisor/               # gVisor-secured challenges
├── kata/                 # Kata Containers (future)
└── flintlock/            # Flintlock microVMs (future)
```

### Challenge Anatomy

Every challenge is a directory containing **3 files**:

#### 1. `Dockerfile`
Builds the challenge image. The container must:
- Start with a base image containing the tools for the scenario
- Install a deliberately broken configuration
- Copy the validator script to `/validator.sh`
- End with `CMD ["sleep", "infinity"]` (sandbox exec's into it)

```dockerfile
FROM ubuntu:22.04
# Install tools, copy broken config, copy validator
COPY validator.sh /validator.sh
RUN chmod +x /validator.sh
CMD ["sleep", "infinity"]
```

#### 2. `validator.sh`
A bash script that checks whether the user has solved the challenge. It must:
- Output a **JSON array** of check results to stdout
- Exit `0` if all checks pass, `1` if any fail, `2+` if the script itself crashed

```bash
#!/bin/bash
# Each check produces a JSON object
cat <<EOF
[
  {"check_id": "nginx_syntax", "passed": true, "message": "Config syntax is valid"},
  {"check_id": "nginx_running", "passed": false, "message": "Nginx is not running"}
]
EOF

# Exit code determines overall pass/fail
if all_passed; then exit 0; else exit 1; fi
```

#### 3. Broken configuration file(s)
The deliberately broken config that the user must fix (e.g., `nginx-broken.conf`).

### Registering a Challenge

After creating the challenge image directory:
1. Build and tag the Docker image
2. Add a `Challenge` row to the database (via Prisma seed script or admin API) with the `dockerImage` field pointing to your image
3. Set the `requiredProvider` field (`docker`, `gvisor`, etc.)

---

## 8. Database Guide

### Schema Overview

All services share a single Postgres database (`appdb`) and the `public` schema. The Prisma schema at `packages/db/prisma/schema.prisma` defines 30+ models across these domains:

| Domain | Models | Purpose |
| :--- | :--- | :--- |
| **Users & Auth** | `User`, `UserSession`, `SecurityLog` | User accounts, session tracking, audit logging |
| **Challenges** | `Challenge`, `LabSession`, `Submission`, `ChallengeCheckResult` | Challenge definitions, active sessions, grading |
| **Content** | `LearningPath`, `Module`, `Node`, `Edge`, `IncidentMetadata` | Curriculum graph, learning paths, knowledge nodes |
| **Gamification** | `Badge`, `UserBadge`, `Completion`, `QuizAttempt` | XP, badges, quiz results, completion tracking |
| **Social** | `UserFollow`, `ChallengeLike`, `ChallengeBookmark`, `ChallengeComment`, `CommentVote`, `ShareToken`, `ChallengeList` | Follow graph, likes, bookmarks, discussions, shareable achievements |
| **B2B / Orgs** | `Org`, `OrgMember`, `OrgInvite`, `OrgScenario`, `PathAssignment` | Multi-tenant organizations, RBAC, custom scenarios |
| **Articles** | `Article`, `ArticleLike`, `ArticleBookmark`, `ArticleReport` | Knowledge base articles and interactions |
| **Event Sourcing** | `AuthOutboxEvent`, `CoreOutboxEvent` | Transactional outbox for reliable async messaging |

### Key Enums
| Enum | Values | Used By |
| :--- | :--- | :--- |
| `Role` | `GUEST`, `LEARNER`, `CONTRIBUTOR`, `ADMIN` | `User.role` |
| `Difficulty` | `JUNIOR`, `MID`, `SENIOR` | `Challenge.difficulty` |
| `Category` | `KUBERNETES`, `DOCKER`, `CICD`, `TERRAFORM`, `BASH`, `SECURITY`, `MONITORING` | `Challenge.category` |
| `SessionStatus` | `ACTIVE`, `COMPLETED`, `EXPIRED`, `TERMINATED` | `LabSession.status` |
| `PlanTier` | `FREE`, `PRO`, `TEAM` | `Org.planTier` — determines concurrent session limits (1/3/5) |
| `OrgRole` | `OWNER`, `ADMIN`, `MEMBER` | `OrgMember.orgRole` — RBAC enforcement |

### Connecting Directly

```bash
# Via psql (while dev stack is running)
psql postgresql://postgres:postgres@127.0.0.1:5444/appdb

# Via Prisma Studio (visual browser)
npx prisma studio --schema=packages/db/prisma/schema.prisma
```

---

## 9. Testing

### E2E Test Suite

The project includes a comprehensive E2E test suite that tests full-stack flows through the Kong API Gateway, asserting on real database rows, Redis entries, and Prometheus metrics.

```bash
# Run the core E2E suite (8 scenarios)
npm run test:e2e

# Run the extended E2E suite
npm run test:e2e:extended

# Run both
npm run test:e2e:all
```

**Prerequisite:** The full stack must be running (`npm run dev:full` or equivalent).

**What it tests:**
- User registration + outbox event creation
- Login cookie security (`HttpOnly`, `SameSite`)
- Invalid login → Prometheus metric increment
- Challenge start → `CoreOutboxEvent` + `LabSession` creation
- Kong gateway routing (`/api/assistant`)
- Organization multi-tenancy guards
- RBAC invite enforcement (MEMBER can't invite)
- Token revocation on logout + Redis denylist verification

### Linting & Formatting

```bash
# Lint all workspaces
npm run lint

# Check formatting (Prettier)
npm run format:check

# Fix formatting
npm run format
```

### CI Pipeline

The GitHub Actions workflow (`.github/workflows/ci.yml`) runs on pushes to `main`, `feat/*`, and `services-*` branches, and on PRs to `main`:

1. **Install** → `npm ci`
2. **Generate** → Prisma client generation
3. **Lint** → Affected packages only (Turborepo filter)
4. **Typecheck** → Affected packages only
5. **Test** → Affected packages only

---

## 10. Troubleshooting & Common Pitfalls

### Port Conflicts

The dev stack uses non-standard ports to avoid conflicts. If something is already using a port:
```bash
# Kill all known dev ports at once
npm run clean
```

This kills processes on ports 3000, 3002, 3003, 3004, 8005, 8090, 5444, 6379, etc., tears down Docker containers, and clears the Next.js `.next` cache.

### Docker Socket Permissions (WSL2)

If the sandbox worker can't connect to the Docker daemon:
```bash
# Verify Docker socket is accessible
wsl ls -la /var/run/docker.sock

# If permission denied, add your user to the docker group in WSL
wsl sudo usermod -aG docker $USER
```

### "Module not found: @devops/observability" or "@devops/messaging"

The shared packages need to be compiled before services can use them:
```bash
npm run build:packages
```

### Prisma Client Not Generated

If you see errors about missing Prisma types:
```bash
npm run db:generate
```

### Redis Denylist Issues

If logout seems to not work (tokens still accepted after logout):
- Check Redis is running: `redis-cli -p 6379 ping`
- Check denylist entries: `redis-cli -p 6379 keys "auth:denylist:*"`
- Remember: sandbox-worker **intentionally** fails open on Redis unreachability

### Outbox Poller Not Processing Events

If events aren't being published to Kafka/RabbitMQ:
- Check the `AuthOutboxEvent` / `CoreOutboxEvent` tables for unprocessed rows:
  ```sql
  SELECT * FROM "AuthOutboxEvent" WHERE processed = false ORDER BY "createdAt" DESC LIMIT 10;
  ```
- The poller runs every `OUTBOX_INTERVAL_MS` (default: 2000ms)
- Check service logs for broker connection errors: `logs/auth-service.log`

### Database Schema Drift

If the database schema is out of sync with the Prisma schema:
```bash
# Reset and push (DESTROYS DATA — dev only)
npm run db:push

# Or apply migrations properly
npx prisma migrate dev --schema=packages/db/prisma/schema.prisma
```

### Full Stack Memory Issues

The default `npm run dev` uses only ~105 MB of Docker RAM. If you need the full stack:
```bash
npm run dev:full
```
This adds Redpanda, RabbitMQ, and the full observability stack (~4.4 GB total).

---

## 11. Where to Go Next

| After you've... | Read... |
| :--- | :--- |
| Run the dev stack | [Local Dev Guide](local-dev-guide.md) — detailed port maps, memory profiles, opt-in workflows |
| Understood the architecture | [High-Level Architecture](high_level_architecture.md) — service inventory, request flows, deployment topology |
| Need implementation details | [Low-Level Architecture](low_level_architecture.md) — container provisioning, tmux PTY, validator mechanics |
| Working on APIs | [API Contract](api-contract.md) — full REST + messaging reference with example payloads |
| Ready to deploy | [Deployment Runbook](deployment-runbook.md) — tiered deployment with health gating |
| Handling incidents | [Operations Runbook](operations-runbook.md) — alerting, incident response |
| Want to know *why* | [ADRs](adr/) — Architectural Decision Records (monorepo, event-driven, Firecracker, etc.) |
| Contributing code | [Contributing Guide](CONTRIBUTING.md) — branch workflow, PR checklist, code standards |
