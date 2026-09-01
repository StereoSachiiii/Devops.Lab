# Automated Platform E2E & Regression Test Plan

## 1. Test Runner Selection & Tooling Justification

* **Test Runner**: `Vitest` (v4.1.8) + `@prisma/client` + `ioredis` + `axios`
* **Justification**:
  * `vitest` is already pinned and configured in workspace root and individual microservices (`package.json`, `services/core/package.json`, `services/notification/package.json`).
  * Seamless native TypeScript ESM execution without compilation steps.
  * Direct asynchronous integration with PostgreSQL database adapters (`@prisma/adapter-pg` / `pg.Pool`), Redis (`ioredis`), and Kong API Gateway HTTP endpoints via `axios`.
  * Headless CLI execution producing deterministic exit codes (`0` on pass, `1` on failure) and structured logs.

---

## 2. Target Test Environment & Setup/Teardown Sequence

* **Target Stack**: `dev.full.sh` / `devops-dev` compose infrastructure + host-native microservices.
* **Stack Preconditions**:
  * PostgreSQL on `127.0.0.1:5444` (`pg_isready -U postgres` healthy)
  * Redis on `127.0.0.1:6379` (`redis-cli ping` healthy)
  * RabbitMQ on `127.0.0.1:5672` (`rabbitmq-diagnostics ping` healthy)
  * Redpanda (Kafka) on `127.0.0.1:19092` (`rpk cluster info` healthy)
  * `redpanda-init` completed (all 6 topics provisioned)
  * Kong API Gateway on `127.0.0.1:8005` (`kong health` healthy)
  * `auth-service` listening on `127.0.0.1:3002`
  * `core-service` listening on `127.0.0.1:3003`
  * `notification-service` listening on `127.0.0.1:3004`
  * `sandbox-worker` listening on `127.0.0.1:8090`
* **Setup Sequence**:
  * Test suite initializes PostgreSQL connection pool (`Pool`), Prisma ORM client (`PrismaClient`), and Redis client (`ioredis`).
  * Validates gateway health at `http://127.0.0.1:8005/health` or core endpoints.
* **Teardown Sequence**:
  * Disconnects Prisma client (`await prisma.$disconnect()`).
  * Closes PostgreSQL connection pool (`await pool.end()`).
  * Closes Redis connection (`redis.disconnect()`).

---

## 3. Detailed Test Scenarios (a through h)

### Scenario A: User Registration & Outbox Transaction Verification
* **Preconditions**: Fresh, unique test user payload generated with random timestamp.
* **Execution Steps**:
  1. `POST http://127.0.0.1:8005/api/auth/register` with `{ email, password, name }`.
* **State Assertions (Deep Verification)**:
  * HTTP status is `201 Created`.
  * Response body contains `user.email` matching input.
  * Query PostgreSQL `AuthOutboxEvent` table directly: confirms row exists with `eventType="UserRegisteredEvent"` and payload containing the new user's email.
  * Query PostgreSQL `AuthOutboxEvent` table: confirms row exists with `eventType="EmailVerificationRequestedEvent"`.
  * Query Redis: confirms verification token stored at key `auth:verify-email:<token>`.

### Scenario B: Valid Login & Cookie Security Assertions
* **Preconditions**: Pre-registered user with hashed password.
* **Execution Steps**:
  1. `POST http://127.0.0.1:8005/api/auth/login` with correct credentials.
* **State Assertions (Deep Verification)**:
  * HTTP status is `200 OK`.
  * Inspect `Set-Cookie` response headers:
    * `token` cookie contains `HttpOnly`, `Path=/`, and `SameSite=Lax`.
    * `refreshToken` cookie contains `HttpOnly`, `Path=/`, and `SameSite=Lax`.
  * Query Redis: confirms active refresh token session entry `auth:refresh:<userId>:<hash>` exists with positive TTL.

### Scenario C: Invalid Login Rejection & Prometheus Metric Verification
* **Preconditions**: Live `auth-service` scraping endpoint available at `http://127.0.0.1:3002/metrics`.
* **Execution Steps**:
  1. Scrape baseline metric value from `/metrics`.
  2. `POST http://127.0.0.1:8005/api/auth/login` with incorrect password.
* **State Assertions (Deep Verification)**:
  * HTTP status is `401 Unauthorized`.
  * Response body contains `{ error: "Invalid credentials", code: "INVALID_CREDENTIALS" }`.
  * Scrape `http://127.0.0.1:3002/metrics`: verifies counter `auth_login_total{outcome="invalid_credentials",service="auth-service"}` incremented.

### Scenario D: Challenge Start & CoreOutboxEvent Verification
* **Preconditions**: Authenticated user session; seeded challenge catalog in PostgreSQL.
* **Execution Steps**:
  1. `GET http://127.0.0.1:8005/api/challenges` with `Bearer <token>`.
  2. `POST http://127.0.0.1:8005/api/challenges/:id/start`.
* **State Assertions (Deep Verification)**:
  * HTTP status is `201 Created`.
  * Response body contains a valid `sessionId` (UUID).
  * Query PostgreSQL `CoreOutboxEvent` table directly: confirms row exists with `eventType="SessionStartedEvent"` and payload containing the generated `sessionId` and target `challengeId`.
  * Query PostgreSQL `LabSession` table directly: confirms session status is `ACTIVE`.

### Scenario E: Gateway Assistant Route Verification (`/api/assistant`)
* **Preconditions**: Kong Gateway running with loaded declarative configuration (`infra/kong/kong.yml`).
* **Execution Steps**:
  1. `POST http://127.0.0.1:8005/api/assistant/chat` with `{ messages: [{ role: "user", content: "hello" }] }`.
* **State Assertions (Deep Verification)**:
  * Gateway forwards request to `core-service`.
  * Response status code is **NOT** `404 Not Found` (verifying the regression fix from Bug #1).

### Scenario F: Organization Multi-Tenancy Guard Verification
* **Preconditions**: Authenticated learner with no organization association (`user.orgId = null`).
* **Execution Steps**:
  1. `GET http://127.0.0.1:8005/api/orgs/me` with `Bearer <token>`.
* **State Assertions (Deep Verification)**:
  * Response status is strictly `404 Not Found` with `{ error: "Not a member of any organization" }`.
  * Confirms system does **NOT** return mock "Acme Corp" fallback data.

### Scenario G: Organization Member RBAC Invite Enforcement
* **Preconditions**: Org `OWNER` creates an organization; adds a second user as `orgRole: "MEMBER"`.
* **Execution Steps**:
  1. `POST http://127.0.0.1:8005/api/orgs/:orgId/invites` authenticated as the `MEMBER`.
* **State Assertions (Deep Verification)**:
  * Response status is strictly `403 Forbidden` with `{ error: "Forbidden: Admin access required" }`.
  * Query PostgreSQL `OrgInvite` table: confirms no unauthorized invitation row was created.

### Scenario H: Token Revocation & Session Isolation on Logout
* **Preconditions**: Authenticated user with active JWT access token and session cookie.
* **Execution Steps**:
  1. `POST http://127.0.0.1:8005/api/auth/logout` with `Bearer <token>`.
  2. Attempt to call protected endpoint `GET http://127.0.0.1:8005/api/auth/me` with the revoked token.
* **State Assertions (Deep Verification)**:
  * Logout returns `200 OK` and clears cookies.
  * Query Redis: verifies token JTI is denylisted (`auth:denylist:jti:<jti>` = `"revoked"`).
  * Subsequent authenticated request with the same token returns `401 Unauthorized` with `{ error: "Token has been revoked" }`.

---

## 4. Scope Boundary Definition

* **IN SCOPE**: The 8 explicit scenarios (a through h) executed end-to-end through Kong Gateway and asserting on real database, cache, header, and metric state.
* **OUT OF SCOPE**: Third-party external API side effects (e.g. real external email sending via Resend API, actual Google/GitHub OAuth provider callbacks).

---

## 5. Definition of "Done"

1. Comprehensive `tests/e2e.test.ts` test file implementing all 8 scenarios without stubs/mocks.
2. Executable via `npm run test:e2e` in the workspace root.
3. 100% passing test execution (8/8 green) directly verified against live stack.
4. Complete audit log documented in `WORKLOG.md` with reproduction commands.
