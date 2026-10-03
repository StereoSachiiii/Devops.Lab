# DevOps.Lab Platform — 100 Technical Interview Questions & Answers

> **Source**: Generated from DevOps.Lab architecture documents, security specifications, operational runbooks, and database schemas in `docs/`.

---

## Table of Contents
1. [High-Level & Low-Level Architecture (Q1 – Q15)](#1-high-level--low-level-architecture-q1--q15)
2. [Authentication, Authorization & Security (Q16 – Q30)](#2-authentication-authorization--security-q16--q30)
3. [Sandbox Orchestration, Terminal Streaming & Isolation (Q31 – Q50)](#3-sandbox-orchestration-terminal-streaming--isolation-q31--q50)
4. [Database Schema, Prisma & Messaging Contracts (Q51 – Q65)](#4-database-schema-prisma--messaging-contracts-q51--q65)
5. [B2B Multi-Tenancy & Product Requirements (Q66 – Q75)](#5-b2b-multi-tenancy--product-requirements-q66--q75)
6. [Operations, Deployment & Runbooks (Q76 – Q88)](#6-operations-deployment--runbooks-q76--q88)
7. [Frontend Architecture, UX & Full-Stack Integration (Q89 – Q100)](#7-frontend-architecture-ux--full-stack-integration-q89--q100)

---

## 1. High-Level & Low-Level Architecture (Q1 – Q15)

### Q1: What is the primary responsibility of each microservice in the platform?
**Answer:**
- **`web-frontend`**: Next.js application providing the dashboard, roadmap viewer, challenge workspace, and integrated Xterm terminal.
- **`auth-service`**: Fastify/Node.js service handling user registration, login, RS256 JWT signing, OAuth2 (GitHub/Google), MFA/TOTP, and session revocation.
- **`core-service`**: Fastify/Node.js service managing learning paths, modules, challenges, active session lifecycle, and B2B organizational data.
- **`sandbox-worker`**: Go service managing isolated container runtimes (Docker, gVisor, Kata, Flintlock), streaming PTY terminal I/O over WebSockets, and running `/validator.sh` grading scripts.
- **`notification-service`**: Node.js worker consuming identity/org events to dispatch transactional emails via Resend/Nodemailer.
- **`api-gateway` (Kong)**: Reverse proxy routing external traffic, handling CORS, and enforcing Redis-backed rate limits.

### Q2: Why does the architecture utilize both Kafka (Redpanda) and RabbitMQ?
**Answer:**
- **Kafka / Redpanda**: Acts as an append-only domain event log for pub/sub events (`identity.user.registered`, `sandbox.challenge.solved`, `sandbox.session.started`), ensuring auditability, replayability, and multi-consumer decoupled fan-out.
- **RabbitMQ**: Used for targeted, point-to-point asynchronous task processing and RPC-style command queues (`provision.sandbox`, `terminate.sandbox`, `send.email`) requiring fine-grained delivery acknowledgments and Dead Letter Queues (DLQ).

### Q3: How does client traffic route through Kong API Gateway to the internal services?
**Answer:**
Kong listens on port `8000` (or `8005` in prod) and proxies traffic over the internal network:
- `/api/auth/*` &rarr; `http://auth-service:3002` (strips prefix)
- `/api/challenges`, `/api/session`, `/api/orgs` &rarr; `http://core-service:3003`
- `/api/content/*` &rarr; `http://core-service:3003` (strips prefix)
- `/sessions/*`, `/validate/*` &rarr; `http://sandbox-worker:8090` (preserves path)

> [!NOTE]
> **Reconciled with Codebase (2026-09-24)**
> - **Classification:** WRONG
> - **Previous text claimed:** Kong proxies `/sessions/*` and `/validate/*` directly to `http://sandbox-worker:8090`.
> - **Actual code behavior:** In `infra/kong/kong.yml`, Kong forwards `/sessions` and `/validate` traffic to `sandbox-router` on port `8080` (`url: http://sandbox-router:8080`), which queries Redis dynamically to reverse-proxy WebSockets and validation commands to the specific worker hosting that container.
> - **Source of truth:** [`infra/kong/kong.yml:117-128`](file:///c:/Users/sachin%20lakshitha/devop/infra/kong/kong.yml#L117-L128)
> - **Why this matters:** In an architecture review or interview, stating Kong routes directly to workers ignores the dynamic worker resolution layer handled by `sandbox-router`.

---

### Q4: How do microservices share the PostgreSQL database, and how is schema integrity maintained?
**Answer:**
- The PostgreSQL instance (`appdb`) uses the shared `public` schema.
- Node.js services (`auth-service`, `core-service`) utilize Prisma via the shared `@devops/db` workspace package containing `schema.prisma`.
- `sandbox-worker` (Go) accesses tables or consumes Kafka events, ensuring schema definitions remain centralized in the monorepo.

> [!NOTE]
> **Reconciled with Codebase (2026-09-24)**
> - **Classification:** STALE
> - **Previous text claimed:** `sandbox-worker` accesses PostgreSQL tables directly.
> - **Actual code behavior:** `sandbox-worker` has zero direct SQL connections to Postgres. It communicates challenge outcomes purely through Kafka event streams (`sandbox.challenge.solved` / `sandbox.challenge.failed`), and `core-service`'s consumer persists check results to the database.
> - **Source of truth:** [`services/sandbox/main.go:45-105`](file:///c:/Users/sachin%20lakshitha/devop/services/sandbox/main.go#L45-L105)
> - **Why this matters:** Database migrations and connection pools in Postgres only concern Node.js services; the Go worker daemon does not open any SQL connections.

---

### Q5: How does `notification-service` interact with both Kafka and RabbitMQ?
**Answer:**
It consumes identity events (`identity.user.registered`, `identity.email.verify`) from Kafka via consumer group `group.notifications`, transforms them into email tasks, and pushes them to RabbitMQ (`send.email`), where worker handlers execute `nodemailer`/Resend dispatchers.

### Q6: What is the step-by-step request flow when a user starts a challenge session?
**Answer:**
1. Frontend issues `POST /api/challenges/:id/start` via Kong to `core-service`.
2. `core-service` checks plan concurrency limits and sets a Redis lock: `core:session:{userId}:{challengeId}`.
3. A Prisma transaction writes a `LabSession` record (`status: ACTIVE`) and creates a `CoreOutboxEvent`.
4. `core-service` publishes `provision.sandbox` to RabbitMQ and `SessionStartedEvent` to Kafka.
5. `sandbox-worker` consumes the AMQP message, provisions the container environment, and initializes networking.

> [!NOTE]
> **Reconciled with Codebase (2026-09-24)**
> - **Classification:** STALE
> - **Previous text claimed:** Step 2 sets a session start lock without specifying its lifetime.
> - **Actual code behavior:** The Redis lock `core:session:{userId}:{challengeId}` uses an acquisition TTL of 10 seconds (`EX 10, NX`). If the service crashes mid-provisioning, the lock expires in 10s rather than wedging the user out of their challenge for an hour.
> - **Source of truth:** [`services/core/src/modules/challenge/challenge.routes.ts:501`](file:///c:/Users/sachin%20lakshitha/devop/services/core/src/modules/challenge/challenge.routes.ts#L501)
> - **Why this matters:** If a crash occurs during challenge provisioning, users can refresh and try again after 10 seconds instead of being locked out.

---

### Q7: How does the platform establish and stream terminal WebSocket sessions?
**Answer:**
The user's browser opens a WebSocket connection to `GET /sessions/:id/terminal` routed by Kong to `sandbox-worker:8090`. `sandbox-worker` connects to a `tmux` session inside the container, piping raw PTY byte streams bidirectionally between the container and the browser client.

### Q8: How does challenge validation (`/validate/:id`) execute and report results?
**Answer:**
`sandbox-worker` invokes Docker Exec to run `/bin/bash /validator.sh` inside the target container. An exit code of `0` indicates pass, `1` indicates check failure, and `2+` indicates script crash. The worker parses stdout (JSON array or fallback plaintext) and records check results.

### Q9: How are container provisioning failures handled?
**Answer:**
If container creation or startup fails, `sandbox-worker` emits a `sandbox.session.failed` event to Kafka, clears transient Redis state, and broadcasts a `FAILED` status event over SSE/WebSocket. `core-service` consumes the Kafka failure event and transitions the session state to `TERMINATED`.

### Q10: How does the platform clean up orphaned containers after unexpected worker crashes?
**Answer:**
A sandbox reaper daemon executes a sweep across container runtimes every minute, identifying and deleting any container tagged `managed-by=devops-platform-sandbox` that is unindexed or has exceeded its 5-minute TTL grace period.

### Q11: What network segregation is configured in `docker-compose.yml`?
**Answer:**
- `global-proxy-net`: External ingress network connecting the host to the Next.js frontend and Kong API Gateway.
- `app-internal`: Isolated internal bridge network connecting backend microservices, datastores (PostgreSQL, Redis), and message brokers (RabbitMQ, Kafka) without direct host port exposure.

### Q12: What gateway settings prevent header truncation with large RSA JWTs and cookies?
**Answer:**
Kong is configured with `KONG_NGINX_HTTP_LARGE_CLIENT_HEADER_BUFFERS="4 64k"` to prevent HTTP 494/413 errors caused by large RSA token payloads or multi-cookie headers.

### Q13: What observability components are included in the architecture?
**Answer:**
- **Prometheus**: Scrapes metrics from `/metrics` endpoints across Fastify and Go services.
- **OpenTelemetry Collector**: Ingests traces and runtime telemetry.
- **Grafana**: Provides centralized dashboards.
- **Loki**: Aggregates structured JSON logs.
- **Tempo**: Stores and visualizes distributed request traces.

### Q14: How are datastore health checks configured in Docker Compose?
**Answer:**
Datastores define native health check commands (`pg_isready` for Postgres, `redis-cli ping` for Redis, `rabbitmq-diagnostics ping` for RabbitMQ, `rpk cluster info` for Redpanda). Dependent services specify `depends_on: { <service>: { condition: service_healthy } }`.

### Q15: How does `core-service` enforce concurrent session limits per plan tier?
**Answer:**
Before creating a session, `core-service` queries the database for active `LabSession` records for the user and enforces limits: 1 concurrent session for Free tier, 3 for Pro, and 5 for Team accounts.

---

## 2. Authentication, Authorization & Security (Q16 – Q30)

### Q16: What password hashing algorithm is used, and what are its security properties?
**Answer:**
**Argon2id** (via the `argon2` package). It provides hybrid protection against both side-channel timing attacks and memory-hard GPU/ASIC brute-force cracking, with automatically generated salts stored directly in the hash string.

### Q17: What algorithm is used for JWT signing and verification, and how are keys managed?
**Answer:**
**RS256** (asymmetric RSA-SHA256). The private key (`JWT_PRIVATE_KEY`) is held exclusively by `auth-service` for signing access tokens, while downstream services (`core-service`, `sandbox-worker`) verify tokens statelessly using the shared public key (`JWT_PUBLIC_KEY`).

### Q18: What is the dual-token architecture implemented in `auth-service`?
**Answer:**
- **Access Token**: Short-lived (15-minute TTL), RS256 JWT, stored in an `HttpOnly` cookie, containing user claims (`sub`, `email`, `role`, `orgId`, `jti`).
- **Refresh Token**: Long-lived (30-day TTL), formatted as `{userId}.{random32ByteHexSecret}`, stored as a SHA-256 hash in Redis, used to rotate into new access tokens.

### Q19: How does access token revocation work via the JTI denylist?
**Answer:**
Each access token contains a unique `jti` UUID. Upon logout or password reset, `auth-service` adds the JTI to Redis under `auth:denylist:jti:{jti}` with a 15-minute TTL. Fastify's `preHandler` hook checks this key and rejects blacklisted tokens with `401 Unauthorized`.

### Q20: What is the fail-open pattern during JTI denylist checks?
**Answer:**
When querying Redis for JTI revocation status, a 250ms timeout is enforced. In `sandbox-worker`, if Redis is unreachable or times out, the check fails open for cryptographically valid RS256 signatures to avoid dropping active terminal connections during transient cache downtime.

### Q21: How does refresh token rotation and replay detection work?
**Answer:**
When a refresh token is exchanged, a new token pair is issued, and the old token's status in Redis is updated to `ROTATED` with a short grace period. If an already-rotated token is reused outside the grace period, the system detects a replay attempt and revokes all refresh tokens for that user.

### Q22: What security flags are configured on authentication cookies?
**Answer:**
`HttpOnly: true` (prevents XSS script access), `SameSite: Lax` (mitigates CSRF), `Secure: true` (enforced in production for HTTPS-only transport), and `Path: /`.

### Q23: How is Multi-Factor Authentication (MFA/TOTP) implemented?
**Answer:**
`auth-service` generates RFC 6238 TOTP secrets, renders QR codes for authenticator apps, and encrypts secrets at rest. During MFA-enabled logins, users must supply both valid credentials and a valid 6-digit time-based code before session tokens are issued.

### Q24: How does the system mitigate credential brute-force attacks?
**Answer:**
Failed login attempts are tracked in Redis by IP and username (`auth:failed_attempts:{identifier}`). Reaching configured thresholds triggers exponential backoff rate limiting or temporary account lockout.

### Q25: What is the Transactional Outbox Pattern in `auth-service`?
**Answer:**
When user state changes occur (e.g., registration), an event record is written to the `AuthOutboxEvent` table inside the same database transaction. A background poller reads unprocessed outbox entries, publishes them to Kafka, and marks them `processed: true`.

### Q26: How does the outbox poller handle Kafka broker outages?
**Answer:**
The outbox processor incorporates a circuit breaker. Repeated Kafka publish failures trip the breaker, pausing outbox polling and applying exponential backoff to avoid resource exhaustion until broker connectivity is restored.

### Q27: What role hierarchy is defined at the platform and organization levels?
**Answer:**
- **Platform Roles** (`Role` enum): `GUEST`, `LEARNER`, `CONTRIBUTOR`, `ADMIN`.
- **Organization Roles** (`OrgRole` enum): `OWNER`, `ADMIN`, `MEMBER`.

### Q28: How does OAuth2 authentication work with external providers?
**Answer:**
Implemented via `@fastify/oauth2` for GitHub and Google. The user completes the provider authorization flow, which redirects to `/api/auth/oauth/{provider}/callback`. `auth-service` exchanges the code for the user profile, creates or links the local account, and sets session cookies.

### Q29: What mechanisms protect against Cross-Site Request Forgery (CSRF)?
**Answer:**
A combination of `SameSite=Lax` cookie transport, strict CORS origin whitelisting on the Kong Gateway (`http://localhost:3000` / production domain), and verification of custom request headers.

### Q30: How is AES-256 encryption used across the platform?
**Answer:**
A 32-byte Base64-encoded `ENCRYPTION_KEY` is used to encrypt sensitive payload data, sandbox configurations, and MFA secrets stored at rest.

---

## 3. Sandbox Orchestration, Terminal Streaming & Isolation (Q31 – Q50)

### Q31: What container runtime isolation backends are supported?
**Answer:**
- **Docker Engine (`docker.go`)**: Standard host container isolation with resource limits.
- **gVisor (`gvisor.go` / `runsc`)**: Application-kernel sandbox intercepting guest system calls.
- **Kata Containers (`kata.go`)**: Hardware-virtualized lightweight microVMs.
- **Flintlock (`flintlock.go`)**: Firecracker microVMs provisioned via gRPC.

### Q32: What security options and capability drops are applied to standard Docker sandboxes?
**Answer:**
Containers are launched with `SecurityOpt: ["no-new-privileges:true"]` and `CapDrop: ["ALL"]`, preventing privilege escalation and removing Linux root capabilities inside the guest container.

### Q33: What is the default networking configuration for challenge containers?
**Answer:**
`NetworkMode: "none"` (`NetworkDisabled: true`) by default. Sandbox containers run without external or internal network access unless a specific networking challenge explicitly requires it.

### Q34: Why is `ReadonlyRootfs` set to `false` for challenge containers?
**Answer:**
DevOps lab exercises require users to modify configuration files, compile code, create directories, install packages, and write log files during hands-on tasks.

### Q35: How does `tmux` maintain persistent terminal sessions across disconnections?
**Answer:**
`sandbox-worker` initializes a background tmux session (`tmux new-session -d -s {prefix+sessionID} /bin/bash`). When a WebSocket connection drops, only the client attach command terminates. Upon reconnection, `sandbox-worker` re-attaches (`tmux attach-session`), restoring full terminal state and scrollback.

### Q36: What fallback occurs if `tmux` is absent in a container image?
**Answer:**
`StartOrAttach` checks `tmux has-session`. If tmux is not installed, it gracefully falls back to spawning `/bin/bash` directly with PTY allocation.

### Q37: How is raw terminal stream multiplexing handled in Go?
**Answer:**
Using `github.com/gorilla/websocket` and Docker's PTY hijacking (`ContainerAttach`), `sandbox-worker` connects stdin, stdout, and stderr streams directly to WebSocket frames for real-time terminal I/O.

### Q38: How does the backend process terminal resize events from the browser?
**Answer:**
The frontend Xterm component transmits `{"type": "resize", "cols": N, "rows": M}` over the WebSocket. `sandbox-worker` decodes this message and calls `ContainerResize` via the Docker Engine API to adjust the PTY dimensions.

### Q39: How does `/validator.sh` return structured check results?
**Answer:**
The validation script outputs a JSON array to stdout (e.g., `[{"check_id": "nginx_port_80", "passed": true, "message": "Nginx listening on port 80"}]`). `sandbox-worker` parses this JSON and records granular check results.

### Q40: How does `sandbox-worker` support older challenge images that output plaintext?
**Answer:**
If stdout is not valid JSON, `sandbox-worker` generates a single synthetic check result using the entire stdout as the feedback message and deriving pass/fail from the script's exit code.

### Q41: What is the purpose of the Dead Letter Queue (DLQ) on `provision.sandbox`?
**Answer:**
If a sandbox provisioning message repeatedly fails (e.g., due to corrupt image layers or host resource exhaustion), RabbitMQ routes it to `provision.sandbox.dlq` after maximum retries to prevent poison-pill message looping.

### Q42: How are CPU and memory limits enforced on sandbox containers?
**Answer:**
`DockerProvider` sets `Memory` (in bytes) and `NanoCPUs` on the container's `HostConfig`, strictly capping resource consumption per container.

### Q43: How does the Flintlock provider integrate Firecracker microVMs?
**Answer:**
It calls Flintlock's gRPC API to provision Firecracker microVMs with dedicated guest kernels and root filesystems, establishing terminal access via SSH tunnels bridged to the WebSocket handler.

### Q44: What happens during sandbox container teardown?
**Answer:**
`sandbox-worker` consumes `terminate.sandbox` from RabbitMQ, closes active WebSockets, executes `ContainerKill` and `ContainerRemove` (`Force: true`), unmounts temporary storage volumes, and evicts session entries from Redis.

### Q45: What domain events are emitted after challenge validation completes?
**Answer:**
`sandbox-worker` publishes `sandbox.challenge.solved` or `sandbox.challenge.failed` to Kafka with submission ID, user ID, challenge ID, pass status, execution duration, and stdout/stderr output.

### Q46: How does the worker prevent blocking during image pulls?
**Answer:**
Common challenge images are pre-cached on worker nodes, dynamic pulls run with Go context cancellation timeouts, and progress messages are streamed asynchronously.

### Q47: How are session TTL expirations enforced?
**Answer:**
Every session has an assigned `ttlMins`. An automated reaper routine checks active sessions against their expiration timestamp, issuing `terminate.sandbox` commands for expired environments.

### Q48: How does gVisor (`runsc`) provide stronger isolation than standard runc?
**Answer:**
`runsc` implements an application kernel in user space that intercepts and handles guest system calls, shielding the host Linux kernel from kernel-level exploits.

### Q49: How are initial challenge scenario files injected into containers?
**Answer:**
Through Docker environment variable injection and archive streaming (`CopyToContainer` API) before the container processes are started.

### Q50: How are Docker container naming conflicts prevented?
**Answer:**
Containers use a deterministic, globally unique naming pattern: `devops-lab-{sessionId}-{randomSuffix}`.

---

## 4. Database Schema, Prisma & Messaging Contracts (Q51 – Q65)

### Q51: Where is the authoritative database schema defined?
**Answer:**
In `packages/db/prisma/schema.prisma`.

### Q52: What core Prisma models track user learning and progress?
**Answer:**
`User`, `LearningPath`, `Module`, `RoadmapNode`, `Challenge`, `LabSession`, `Submission`, and `ChallengeCheckResult`.

### Q53: What fields constitute the `LabSession` model?
**Answer:**
`id`, `userId`, `challengeId`, `status` (`ACTIVE`, `COMPLETED`, `TERMINATED`, `EXPIRED`), `containerId`, `startedAt`, `expiresAt`, and `completedAt`.

### Q54: What is the functional difference between `AuthOutboxEvent` and `CoreOutboxEvent`?
**Answer:**
- `AuthOutboxEvent`: Stores identity and authentication events within `auth-service` transactions.
- `CoreOutboxEvent`: Stores curriculum, lab session lifecycle, and organization events within `core-service` transactions.

### Q55: What payload schema is used for `identity.user.registered` on Kafka?
**Answer:**
```json
{
  "userId": "string",
  "email": "string",
  "name": "string | null"
}
```

### Q56: What payload schema is used for `sandbox.session.started` on Kafka?
**Answer:**
```json
{
  "type": "session.started",
  "sessionId": "string",
  "userId": "string",
  "challengeId": "string",
  "image": "string",
  "ttlMins": 30
}
```

### Q57: What payload schema is used for `curriculum.challenge.solved` on Kafka?
**Answer:**
```json
{
  "submissionId": "string",
  "challengeId": "string",
  "userId": "string",
  "passed": true,
  "stdout": "string",
  "stderr": "string",
  "exitCode": 0,
  "durationMs": 1420
}
```

### Q58: What payload schema is used for `send.email` on RabbitMQ?
**Answer:**
```json
{
  "type": "welcome | verification | org_invite",
  "userId": "string",
  "email": "string",
  "token": "optional-token-string"
}
```

### Q59: What junction model manages multi-tenant B2B organization memberships?
**Answer:**
`OrgMember`, which links `orgId` and `userId` with an `OrgRole` (`OWNER`, `ADMIN`, `MEMBER`) and membership timestamps.

### Q60: How are private organization custom scenarios represented in Prisma?
**Answer:**
Via the `OrgScenario` model, storing scenario metadata, base Docker image, instructions markdown, validation checks, and visibility status (`PRIVATE`, `PENDING_REVIEW`, `APPROVED_PUBLIC`).

### Q61: How are learning path assignments managed for teams?
**Answer:**
Via `PathAssignment`, which associates a `LearningPath` with an individual `OrgMember` or an entire `Org`, including completion deadlines and progress tracking.

### Q62: How are quiz submissions stored and evaluated against roadmap milestones?
**Answer:**
Quiz submission records link to `RoadmapNode` and `User`, storing selected answers, scores, and pass criteria required to unlock subsequent roadmap nodes.

### Q63: What database indexing strategy optimizes session lookups?
**Answer:**
Indexes on `userId`, `challengeId`, `status`, and compound indexes on `(userId, status)` to accelerate active session checks and user progress queries.

### Q64: How are generated Prisma client types distributed across the monorepo?
**Answer:**
`prisma generate` outputs the client to `packages/db`, which is imported as `@devops/db` across `auth-service`, `core-service`, and worker packages.

### Q65: How do event consumers achieve idempotent processing?
**Answer:**
By tracking processed message IDs in Redis or database transaction logs, ensuring duplicate message deliveries do not trigger duplicate state mutations.

---

## 5. B2B Multi-Tenancy & Product Requirements (Q66 – Q75)

### Q66: What are the primary user roles within the B2B organization model?
**Answer:**
- **Org Owner**: Manages subscription plans, billing, and full organization settings.
- **Org Admin**: Manages team members, invites, and learning path assignments.
- **Org Member**: Engineers who solve challenges and complete assigned team paths.
- **Platform Admin**: Reviews and approves custom scenarios submitted for public challenge catalog promotion.

### Q67: What is the process for inviting a team member to an organization?
**Answer:**
An Org Admin submits the member's email on the `/teams` dashboard. `core-service` writes an `OrgInvite` record and outbox event, and `notification-service` dispatches an invitation email with a secure registration/join link.

### Q68: What occurs when an invited engineer accepts an invitation?
**Answer:**
The invite token is validated, the user is authenticated, an `OrgMember` record is created with role `MEMBER`, and the organization's assigned learning paths appear on the engineer's dashboard.

### Q69: What is the lifecycle of a Private Custom Scenario created by an organization?
**Answer:**
1. Created and saved as `PRIVATE` (accessible only to members of that organization).
2. Optionally submitted for `PUBLIC` contribution review.
3. Reviewed by Platform Admins.
4. Promoted to a first-class `Challenge` record in the public catalog with attribution.

### Q70: How does path assignment differ between individual engineers and whole teams?
**Answer:**
Assignments can target a specific `userId` or apply org-wide (automatically enrolling all current and future members of the organization).

### Q71: What metrics are provided on the B2B `/teams` analytics dashboard?
**Answer:**
Total team members, concurrent active sandbox count, average skill score/XP, path completion rate, weekly velocity trends, and individual member progress breakdowns.

### Q72: How is multi-tenant data isolation enforced across API endpoints?
**Answer:**
`tenantPrismaPlugin` and route middleware extract and validate the `orgId` claim from the user's JWT, scoping database queries strictly to the caller's organization.

### Q73: How does custom scenario promotion integrate with existing challenge grading?
**Answer:**
Because `OrgScenario` models use the same structure as `Challenge` models (Docker image, `/validator.sh` script, check criteria), promotion creates a standard `Challenge` record without requiring changes to `sandbox-worker`.

### Q74: What happens to user progress if an engineer leaves an organization?
**Answer:**
The `OrgMember` junction record is removed, unlinking org-specific path assignments while preserving the engineer's personal XP, challenge completions, and submission history.

### Q75: How are container images for custom scenarios managed securely?
**Answer:**
Custom images must be sourced from approved container registries, undergo automated vulnerability scanning, and execute under standard sandbox security restrictions (`no-new-privileges`, capability drops, network isolation).

---

## 6. Operations, Deployment & Runbooks (Q76 – Q88)

### Q76: What command sequence deploys the platform using Docker Compose in production?
**Answer:**
```bash
cp .env.production .env
npx prisma migrate deploy --schema=packages/db/prisma/schema.prisma
docker compose -f docker-compose.prod.yml up -d --build
docker compose ps
```

### Q77: What are the primary health check endpoints for each service?
**Answer:**
- **Kong Gateway**: `http://<HOST>:8005/api/health`
- **Auth Service**: `http://<HOST>:3002/health`
- **Core Service**: `http://<HOST>:3003/health`
- **Sandbox Worker**: `http://<HOST>:8090/health`
- **Prometheus**: `http://<HOST>:9090`
- **Grafana**: `http://<HOST>:3001`

### Q78: How are database migrations safely executed in production?
**Answer:**
Using `npx prisma migrate deploy` during pre-deployment CI/CD stages prior to starting updated container instances, ensuring all schema alterations maintain backward compatibility.

### Q79: What is the rollback procedure if a deployment encounters critical issues?
**Answer:**
Run `./rollback.sh`, which reverts image tags in `docker-compose.prod.yml` to the previous stable release, restarts container instances, and verifies health check endpoints.

### Q80: How do you stream logs for an individual microservice?
**Answer:**
Run `docker compose -f docker-compose.prod.yml logs -f <service_name>` (e.g., `core-service` or `sandbox-worker`), or query Loki via Grafana Explore.

### Q81: What metric indicates a backlog in sandbox container provisioning?
**Answer:**
`rabbitmq_queue_messages_ready{queue="provision.sandbox"}`. A sustained elevation indicates worker saturation or container provisioning bottlenecks on worker nodes.

### Q82: How do you identify and resolve transactional outbox lag?
**Answer:**
Query the count of records where `processed = false` in `CoreOutboxEvent`/`AuthOutboxEvent`, inspect service logs for Kafka connection errors or tripped circuit breakers, and check Kafka broker health using `rpk cluster info`.

### Q83: How is Redis memory managed under high session volume?
**Answer:**
Explicit TTLs are applied to all keys (15m for access token denylist, 30d for refresh tokens, session duration for locks), and Redis is configured with `maxmemory-policy volatile-lru`.

### Q84: What operational steps resolve disk space exhaustion on Docker hosts?
**Answer:**
Execute `docker system prune -af --volumes` to remove unreferenced layers and stopped containers, confirm the sandbox reaper is actively cleaning expired sandboxes, and expand host disk volume capacity.

### Q85: How are production secrets managed in Kubernetes environments?
**Answer:**
Provisioned via Kubernetes Secrets or external secret managers (AWS Secrets Manager, HashiCorp Vault) and mounted as environment variables (`DATABASE_URL`, `JWT_PRIVATE_KEY`, `REDIS_URL`) in deployment manifests.

### Q86: What alert thresholds are configured for the Kong API Gateway?
**Answer:**
HTTP 5xx response rate exceeding 1% over 5 minutes, upstream response latency p95 exceeding 2 seconds, and Redis connection failure alerts for rate-limiting backends.

### Q87: How do you recover a stalled Kafka consumer group?
**Answer:**
Trigger the service's consumer group reset endpoint or restart the service container to trigger a Kafka consumer group rebalance.

### Q88: What automated smoke tests validate a deployment?
**Answer:**
Run `./smoke-tests.sh` to verify user authentication, challenge list retrieval, sandbox container provisioning, WebSocket terminal echo, and validation endpoint execution.

---

## 7. Frontend Architecture, UX & Full-Stack Integration (Q89 – Q100)

### Q89: What frontend stack is utilized in `apps/web`?
**Answer:**
Next.js (App Router), React, Tailwind CSS, SWR for client-side data fetching, and `@xterm/xterm` with Xterm addons for terminal emulation.

### Q90: How does the frontend render the interactive roadmap graph?
**Answer:**
Using a node-graph component that displays prerequisite links, completed milestones, locked modules, and active roadmap nodes fetched from `/api/content/roadmaps`.

### Q91: How is Xterm.js wired to the backend WebSocket terminal stream?
**Answer:**
An Xterm instance connects to `ws://<gateway>/sessions/:id/terminal`. Incoming WebSocket messages are written to the terminal via `term.write()`, while user keystrokes (`term.onData`) are sent as WebSocket packets to `sandbox-worker`.

### Q92: How are real-time container provisioning states communicated to the UI?
**Answer:**
The frontend listens to Server-Sent Events (SSE) or WebSocket progress messages (`PULLING_IMAGE`, `CREATING_CONTAINER`, `ATTACHING_NETWORK`, `READY`, `FAILED`) to update the workspace loading bar in real time.

### Q93: What caching and revalidation strategy does the frontend use?
**Answer:**
SWR (Stale-While-Revalidate) with automatic revalidation on window focus and optimistic UI updates for challenge submissions and roadmap progress.

### Q94: How is client authentication maintained across page navigations?
**Answer:**
Via `HttpOnly` session cookies forwarded by Next.js middleware and API routes to the Kong Gateway, with an SWR hook bound to `/api/auth/me` providing user state to React components.

### Q95: How does the frontend handle access token expiration during active sessions?
**Answer:**
An Axios/fetch response interceptor catches `401 Unauthorized` responses, calls `POST /api/auth/refresh` to rotate cookies, and seamlessly retries the original API request without interrupting the user.

### Q96: What is the layout structure of the challenge workspace?
**Answer:**
A three-pane responsive layout: left pane for markdown instructions and tasks, center pane for the live Xterm terminal, and right pane for check progress, hints, and submission controls.

### Q97: How are challenge validation results presented to the user?
**Answer:**
When the user triggers validation, the UI polls `/api/session/:id/check-results` or listens for test completion events, displaying step-by-step pass/fail badges, stdout logs, and error explanations.

### Q98: How does the UI prevent duplicate sandbox creation requests?
**Answer:**
The "Start Challenge" button enters a disabled loading state immediately on click, and client-side debounce logic prevents duplicate requests while the backend Redis lock is active.

### Q99: How is theme preference persisted across sessions?
**Answer:**
Using `next-themes` integrated with Tailwind CSS dark classes, storing preferences in `localStorage` and syncing with system color scheme settings.

### Q100: How does the terminal handle transient network disconnections?
**Answer:**
If the WebSocket closes unexpectedly, Xterm displays a "Reconnecting..." status overlay and attempts reconnection with exponential backoff, reconnecting to the running `tmux` session without losing state.
