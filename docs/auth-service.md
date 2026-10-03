# Authentication Service Deep-Dive (`services/auth`)

Exhaustive documentation of the auth service internals — security architecture, session mechanics, circuit breakers, OAuth flows, MFA, and the outbox pipeline. Traced directly from source code in `services/auth/src/`.

---

## Table of Contents

1. [Plugin Architecture](#1-plugin-architecture)
2. [Cryptography & Hashing](#2-cryptography--hashing)
3. [Session Lifecycle & Token Mechanics](#3-session-lifecycle--token-mechanics)
4. [JTI Denylist & Access Token Revocation](#4-jti-denylist--access-token-revocation)
5. [Redis Circuit Breaker (Fail-Open Pattern)](#5-redis-circuit-breaker-fail-open-pattern)
6. [Rate Limiting & Account Lockout](#6-rate-limiting--account-lockout)
7. [Registration Flow](#7-registration-flow)
8. [Login Flow](#8-login-flow)
9. [Refresh Token Rotation & Replay Detection](#9-refresh-token-rotation--replay-detection)
10. [OAuth (GitHub, Google, Enterprise SSO)](#10-oauth-github-google-enterprise-sso)
11. [Multi-Factor Authentication (MFA/TOTP)](#11-multi-factor-authentication-mfatotp)
12. [Account Management](#12-account-management)
13. [Outbox Pattern & Kafka Circuit Breaker](#13-outbox-pattern--kafka-circuit-breaker)
14. [Health Registry](#14-health-registry)
15. [Prometheus Metrics](#15-prometheus-metrics)
16. [Security Audit Trail](#16-security-audit-trail)
17. [Redis Key Reference](#17-redis-key-reference)

---

## 1. Plugin Architecture

The auth service is a Fastify application (`src/app.ts`) assembled from modular plugins. Every plugin is registered on the Fastify instance via `fastify-plugin`:

| Plugin | File | What It Decorates | Purpose |
| :--- | :--- | :--- | :--- |
| `jwtPlugin` | `plugins/jwt.ts` | `fastify.jwt`, `fastify.jwtPublicKey` | RS256 JWT signing/verification using `@fastify/jwt` |
| `oauth2Plugin` | `plugins/oauth2.ts` | `fastify.github`, `fastify.google` | GitHub + Google OAuth2 flows via `@fastify/oauth2` |
| `kafkaPlugin` | `plugins/kafka.ts` | `fastify.kafka` | Kafka producer (non-blocking init, service starts even if Kafka is down) |
| `redisPlugin` | `plugins/redis.ts` | `fastify.redis` | ioredis client with retry strategy, `enableOfflineQueue: false` |
| `outboxPlugin` | `plugins/outbox.ts` | _(interval timer)_ | Background outbox poller with Kafka circuit breaker |
| `metricsPlugin` | `plugins/metrics.ts` | `fastify.metrics` | Prometheus registry, counters, histograms, `/metrics` endpoint |
| `tenantPrismaPlugin` | `plugins/tenant-prisma.ts` | `req.prisma` | Per-request Prisma client decoration |

**Route modules:** `routes/account.ts` (29KB, core auth flows), `routes/mfa.ts` (MFA setup/verify/login), `routes/oauth.ts` (OAuth callbacks + SSO).

**Global hooks:**
- `onRequest`: Sets aggressive no-cache headers (`Cache-Control: no-store`, `Pragma: no-cache`, `Expires: 0`) on every response.
- `preHandler`: Checks JTI denylist in Redis for every request carrying a JWT — if the JTI is denylisted, returns `401 Token has been revoked`.

---

## 2. Cryptography & Hashing

### Password Hashing — Argon2

All passwords are hashed with **Argon2id** (winner of the Password Hashing Competition). The `argon2` npm package handles salt generation, tuning parameters, and verification automatically. The salt is embedded in the hash string stored in the `User.password` column.

**Source:** [`account.ts:127`](file:///c:/Users/sachin%20lakshitha/devop/services/auth/src/routes/account.ts#L127) — `argon2.hash(password)`
**Verification:** [`account.ts:232`](file:///c:/Users/sachin%20lakshitha/devop/services/auth/src/routes/account.ts#L232) — `argon2.verify(user.password, password)`

### JWT Signing — RS256 Asymmetric

| Property | Value | Source |
| :--- | :--- | :--- |
| Algorithm | RS256 (RSA-SHA256) | Asymmetric — private key signs, public key verifies |
| Private key | `JWT_PRIVATE_KEY` | Injected **only** into `auth-service` |
| Public key | `JWT_PUBLIC_KEY` | Shared with `core-service`, `sandbox-worker` for independent verification |
| Access token TTL | 15 minutes | `config.expiry.accessToken = "15m"` |
| Issuer claim | `JWT_ISSUER` (default: `devops-platform`) | Embedded as `iss` in every token |
| JTI claim | `crypto.randomUUID()` | Unique per token, used for denylist revocation |

**Access token payload:**
```json
{
  "sub": "userId",
  "email": "user@example.com",
  "role": "LEARNER",
  "orgId": "org-123",
  "iss": "devops-platform",
  "jti": "uuid-unique-per-token"
}
```

**Source:** [`session.ts:97-110`](file:///c:/Users/sachin%20lakshitha/devop/services/auth/src/utils/session.ts#L97-L110) — `signAccessToken()`

### AES Encryption

The `ENCRYPTION_KEY` (32-byte Base64 AES key) is used by the sandbox service for encrypting sandbox state. Auth service uses it indirectly through shared infrastructure.

---

## 3. Session Lifecycle & Token Mechanics

### Dual-Token Architecture

On every successful authentication (login, register, OAuth, MFA), the system issues **two tokens**:

| Token | Transport | TTL | Purpose |
| :--- | :--- | :--- | :--- |
| **Access Token** | `token` cookie (`HttpOnly`, `SameSite=Lax`, `Secure` in prod) | 15 minutes | Short-lived API authorization. Contains `jti` for revocation. |
| **Refresh Token** | `refreshToken` cookie (same attributes) | 30 days (configurable) | Long-lived session persistence. Used to rotate into a new access token. |

### Refresh Token Anatomy

The refresh token is **not a JWT**. It's a custom format:

```
Format:  {userId}.{random32ByteHexSecret}
Example: cuid123abc.a1b2c3d4e5f6...64hexchars
```

**Server-side storage:** The server never stores the raw secret. It computes `sha256(secret)` and stores the hash in Redis:
- **Key:** `auth:refresh:{userId}:{tokenHash}`
- **Value:** `"1"` (active) or `JSON { status: "ROTATED", rotatedAt: timestamp }` (rotated, in grace period)
- **TTL:** 30 days

**Source:** [`session.ts:152-175`](file:///c:/Users/sachin%20lakshitha/devop/services/auth/src/utils/session.ts#L152-L175) — `setSessionCookies()`

### Cookie Configuration

```typescript
{
  httpOnly: true,     // Not accessible via JavaScript
  path: "/",          // Sent on all routes
  sameSite: "lax",    // Protects against CSRF
  secure: isProd,     // HTTPS-only in production
  domain: COOKIE_DOMAIN  // Optional domain scoping
}
```

**Source:** [`session.ts:87-94`](file:///c:/Users/sachin%20lakshitha/devop/services/auth/src/utils/session.ts#L87-L94)

---

## 4. JTI Denylist & Access Token Revocation

Every access token carries a unique `jti` (JWT ID) claim. Upon logout, session revocation, or breach detection, the token's JTI is added to a Redis denylist.

**Denylist key:** `auth:denylist:jti:{jti}`
**Value:** `"revoked"`
**TTL:** 900 seconds (15 minutes — matches access token lifetime)

**Enforcement:**
- **Auth service:** A `preHandler` hook on every route calls `isTokenDenylisted()` which uses `redisSafeGet()` with a 250ms timeout. If denylisted → `401 Token has been revoked`.
- **Sandbox worker (Go):** Also checks the denylist with a 250ms Redis timeout, but **fails open** — if Redis is unreachable, valid RS256 signatures are allowed through to protect active WebSocket terminal sessions.

**Source:** [`session.ts:112-136`](file:///c:/Users/sachin%20lakshitha/devop/services/auth/src/utils/session.ts#L112-L136)

---

## 5. Redis Circuit Breaker (Fail-Open Pattern)

The auth service implements a **fail-open circuit breaker** for Redis operations on the hot path. This prevents Redis latency spikes or outages from cascading into auth request failures.

### `redisSafeGet(fastify, key, timeoutMs = 250)`

Executes `redis.GET` with a hard timeout via `Promise.race`. If Redis hangs, disconnects, or errors, returns `null` (fail-open).

**Used by:**
- Account lockout check (`auth:lockout:{email}`) — if Redis is slow, login proceeds without lockout enforcement
- JTI denylist check (`auth:denylist:jti:{jti}`) — if Redis is slow, the token is treated as valid

### `redisSafeExecute(fastify, operation, timeoutMs = 250)`

Wraps any Redis write operation (SET, INCR, DEL) with a timeout and error swallowing. Non-critical writes that fail silently.

**Used by:**
- Failed login counter increment (`auth:fails:{email}`)
- Lockout key setting
- Failed login counter cleanup on successful login

**Source:** [`redis-safe.ts:1-50`](file:///c:/Users/sachin%20lakshitha/devop/services/auth/src/utils/redis-safe.ts)

### Redis Client Configuration

The ioredis client itself is configured with resilience patterns:

```typescript
{
  lazyConnect: true,           // Don't block service startup on Redis
  enableOfflineQueue: false,   // Reject commands immediately if disconnected
  maxRetriesPerRequest: 3,     // Retry failed commands 3 times
  commandTimeout: 2000,        // Hard 2s timeout per command
  retryStrategy: (times) => Math.min(times * 100, 3000)  // Exponential backoff capped at 3s
}
```

Redis connection failure is logged as a warning, not an error — the service starts and operates in degraded mode.

**Source:** [`plugins/redis.ts:15-24`](file:///c:/Users/sachin%20lakshitha/devop/services/auth/src/plugins/redis.ts#L15-L24)

---

## 6. Rate Limiting & Account Lockout

### Brute-Force Protection (In-App)

| Mechanism | Redis Key | Threshold | Lockout Duration |
| :--- | :--- | :--- | :--- |
| Failed login counter | `auth:fails:{email}` | 5 attempts | Triggers lockout |
| Account lockout | `auth:lockout:{email}` | N/A | 15 minutes (`config.expiry.lockout`) |

**Flow:** Each failed login increments `auth:fails:{email}` via `redisSafeExecute`. On the first failure, a TTL is set on the counter. When the counter hits 5, a lockout key is set. Subsequent login attempts check the lockout key via `redisSafeGet` — if present, return `429 ACCOUNT_LOCKED`.

**Fail-open behavior:** If Redis is slow/down, the lockout check fails open (login proceeds). This is a deliberate trade-off: availability over strict rate limiting during Redis outages.

**Source:** [`account.ts:71-95`](file:///c:/Users/sachin%20lakshitha/devop/services/auth/src/routes/account.ts#L71-L95) — `handleLoginFail()`

### Gateway Rate Limiting (Kong)

Kong enforces **100 req/sec per IP** on auth routes. Exceeding this returns `429 Too Many Requests` at the gateway level, before requests reach the auth service.

---

## 7. Registration Flow

`POST /api/auth/register` — traced step by step:

1. **Schema validation** — Fastify validates email format and password length (min 8) via TypeBox schema
2. **Uniqueness check** — `prisma.user.findUnique({ where: { email } })`. If exists → `400 USER_EXISTS`
3. **Password hash** — `argon2.hash(password)`
4. **Verification token** — `crypto.randomUUID()`
5. **Atomic transaction** — A single Prisma `$transaction` creates:
   - `User` record (role: `LEARNER`)
   - `AuthOutboxEvent` — type `UserRegisteredEvent`, payload `{ userId, email, name }`
   - `AuthOutboxEvent` — type `EmailVerificationRequestedEvent`, payload `{ userId, email, token }`
   - `SecurityLog` — action `REGISTER` with IP and user-agent
6. **Redis verification token** — `auth:verify-email:{token}` = userId, TTL 24 hours
7. **Session creation** — Calls `createSession()` which sets both cookies and returns the access token
8. **Prometheus metric** — `auth_register_total{outcome="success"}` incremented

**Every step is wrapped in an OpenTelemetry span** (`auth.register`) with attributes for email, outcome, and user_id.

**Source:** [`account.ts:111-190`](file:///c:/Users/sachin%20lakshitha/devop/services/auth/src/routes/account.ts#L111-L190)

---

## 8. Login Flow

`POST /api/auth/login` — traced step by step:

1. **Prometheus timer started** — `loginDuration.startTimer()`
2. **Lockout check** — `redisSafeGet(auth:lockout:{email}, 250ms)`. Fail-open.
3. **User lookup** — `prisma.user.findUnique({ where: { email } })`
4. **Password verification** — `argon2.verify()`. If fails → `handleLoginFail()` + `401 INVALID_CREDENTIALS`
5. **Clear fail counter** — `redisSafeExecute(() => redis.del(auth:fails:{email}), 250ms)`
6. **Security log** — `LOGIN_SUCCESS` event
7. **MFA gate** — If `user.mfaEnabled`:
   - Sign a short-lived JWT with `{ sub: userId, pendingMfa: true }`
   - Return `{ mfaRequired: true, mfaToken }` — NOT a session
   - User must complete MFA via `POST /login/mfa` to get actual tokens
8. **Session creation** — `setSessionCookies()` + `trackLogin()` (creates `UserSession` row, updates `lastLoginAt`/`firstLoginAt`)
9. **Prometheus metrics** — `auth_login_total{outcome="success|invalid_credentials|account_locked|mfa_required|error"}`

**Source:** [`account.ts:192-282`](file:///c:/Users/sachin%20lakshitha/devop/services/auth/src/routes/account.ts#L192-L282)

---

## 9. Refresh Token Rotation & Replay Detection

`POST /api/auth/refresh` — the most nuanced flow in the auth system.

### Normal Rotation
1. Parse refresh token from cookie → extract `userId` and `secret`
2. Compute `sha256(secret)` → build Redis key `auth:refresh:{userId}:{tokenHash}`
3. `GET` the Redis key:
   - **Value is `"1"`** → Token is active. Mark it as rotated: `SET key '{"status":"ROTATED","rotatedAt":now}' EX 30d`
   - Issue new access + refresh tokens via `createSession()`

### Grace Period (Concurrent Request Handling)
If the value is `{"status":"ROTATED","rotatedAt":X}`:
- **Within 10 seconds** of rotation → Honor the request (concurrent tab/request scenario). Issue new tokens.
- **Outside 10 seconds** → **Replay attack detected.**

### Replay Attack Response (`SESSION_COMPROMISED`)
When a token is used outside the grace period:
1. `invalidateAllSessions(fastify, userId)` — **nukes all sessions across all devices**
   - Uses `SCAN` (not `KEYS`) to iterate Redis keys matching `auth:refresh:{userId}:*`, deleting them in batches of 100
   - Updates all `UserSession` rows in Postgres: `revokedAt = now`
2. Logs `REVOCATION_BREACH` security event
3. Returns `401 SESSION_COMPROMISED`

### Key Not Found
If the Redis key doesn't exist (expired naturally or explicitly logged out):
- Returns `401 SESSION_EXPIRED` — does **not** trigger a breach response

**Source:** [`account.ts:415-479`](file:///c:/Users/sachin%20lakshitha/devop/services/auth/src/routes/account.ts#L415-L479)

---

## 10. OAuth (GitHub, Google, Enterprise SSO)

### Exchange-Token Pattern

OAuth callbacks cannot set cookies on cross-origin redirects (browser SameSite rules block them). The auth service uses a **single-use exchange token** pattern:

1. OAuth provider redirects to `/login/{provider}/callback`
2. Auth service exchanges the authorization code for an access token
3. Auth service creates/finds the user (see upsert logic below)
4. Auth service generates a UUID exchange token, stores it in Redis: `auth:exchange:{token}` = userId, TTL 60 seconds
5. Redirects to `{FRONTEND_URL}/auth/callback?exchange_token={token}`
6. Frontend immediately `POST /api/auth/exchange` with the token
7. Auth service atomically gets + deletes the Redis key (`GETDEL` — single-use)
8. Sets session cookies on this same-origin response

**Source:** [`oauth.ts:14-18`](file:///c:/Users/sachin%20lakshitha/devop/services/auth/src/routes/oauth.ts#L14-L18), [`account.ts:492-520`](file:///c:/Users/sachin%20lakshitha/devop/services/auth/src/routes/account.ts#L492-L520)

### GitHub Email Resolution

GitHub profile email may be null/private. The service makes a secondary authenticated call to `https://api.github.com/user/emails` to find the verified primary email.

### User Upsert Logic (`findOrCreateOAuthUser`)

Executes in a Prisma `$transaction` for atomicity:

1. **Find by provider ID** — `githubId`, `googleId`, or `ssoId`
2. **If found** — Auto-verify email if provider says it's verified. Return existing user.
3. **Find by email** — If same email exists (e.g., user registered with email/password first)
4. **If found by email** — **Link** the OAuth provider to the existing account (update `githubId`/`googleId`/`ssoId` on the row). Return existing user.
5. **If not found** — Create new user + `AuthOutboxEvent` (`UserRegisteredEvent`) atomically in the same transaction.

**Source:** [`oauth.ts:193-261`](file:///c:/Users/sachin%20lakshitha/devop/services/auth/src/routes/oauth.ts#L193-L261)

### Enterprise SSO (`POST /login/sso`)

Supports Okta, SAML, and Azure AD domain-based login:
1. Validates `email` + `orgSlug` (or `ssoId`)
2. Looks up the `Org` by slug or `ssoDomain` (email domain matching)
3. Creates/finds user with `ssoId` as the provider identifier
4. Auto-assigns `orgId` on the user record
5. Returns an exchange token (same pattern as OAuth)

**Source:** [`oauth.ts:122-177`](file:///c:/Users/sachin%20lakshitha/devop/services/auth/src/routes/oauth.ts#L122-L177)

---

## 11. Multi-Factor Authentication (MFA/TOTP)

### Setup Flow
1. `POST /mfa/setup` — Generates a TOTP secret via `otplib.authenticator.generateSecret()`
2. Creates `otpauth://` URI and QR code (via `qrcode` npm package)
3. Stores secret on `User.mfaSecret` — MFA is **not yet active**
4. Returns `{ secret, qrCodeUrl }` for the user to scan

### Activation Flow
1. `POST /mfa/verify` — User submits the 6-digit code from their authenticator app
2. Server verifies via `authenticator.verify({ token: code, secret: user.mfaSecret })`
3. If valid → sets `User.mfaEnabled = true`

### Login with MFA
1. Normal login flow proceeds through password verification
2. If `user.mfaEnabled` → returns `{ mfaRequired: true, mfaToken }` (short-lived JWT with `pendingMfa: true`)
3. `POST /login/mfa` — User submits `{ mfaToken, code }`
4. Server verifies the JWT, confirms `pendingMfa: true`, verifies the TOTP code
5. If valid → creates a full session (access + refresh tokens)

**Source:** [`mfa.ts:1-96`](file:///c:/Users/sachin%20lakshitha/devop/services/auth/src/routes/mfa.ts)

---

## 12. Account Management

| Route | Method | Auth Required | Action |
| :--- | :--- | :--- | :--- |
| `/me` | `GET` | Yes | Returns full user profile (XP, badges, streaks, MFA status, notification prefs). Checks `hasPassword` without selecting the hash. |
| `/me` | `PUT` | Yes | Updates `name` and/or `jobTitle` |
| `/me` | `DELETE` | Yes | Deletes user + all submissions, completions, sessions, security logs. Invalidates all sessions. Emits `UserDeletedEvent` via outbox. |
| `/change-password` | `POST` | Yes | Verifies current password via Argon2, hashes new password, updates user |
| `/forgot-password` | `POST` | No | Generates reset token, stores in Redis (`auth:reset-password:{token}`, 1h TTL), creates `PasswordResetRequestedEvent` outbox event. Always returns success (prevents email enumeration). |
| `/reset-password` | `POST` | No | Validates token from Redis, hashes new password, invalidates all sessions |
| `/verify-email` | `POST` | No | Validates token from Redis (`auth:verify-email:{token}`), sets `emailVerified` |
| `/logout` | `POST` | No (best-effort JWT verify) | Deletes refresh token from Redis, denylists access token JTI, clears cookies |
| `/logout-all` | `POST` | Yes | Invalidates ALL sessions (SCAN + DEL pattern), denylists current JTI, clears cookies |
| `/security-log` | `GET` | Yes | Paginated audit log (default 20/page, max 100) |
| `/sessions` | `GET` | Yes | Lists all active `UserSession` records (non-revoked) |
| `/sessions/:id/revoke` | `POST` | Yes | Revokes a specific session — deletes its exact Redis key, sets `revokedAt` |
| `/public-key` | `GET` | No | Returns the RS256 public key for downstream services |

---

## 13. Outbox Pattern & Kafka Circuit Breaker

### Why the Outbox Pattern

Postgres and Kafka are separate distributed systems. A direct `INSERT user` → `kafka.emit()` sequence is a **dual write** — if Kafka fails after the DB commits, the event is lost forever. The outbox pattern solves this by making the event part of the database transaction.

### Outbox Poller (`plugins/outbox.ts`)

A background `setInterval` (configurable via `OUTBOX_INTERVAL_MS`, default 2000ms) queries:

```sql
SELECT * FROM "AuthOutboxEvent"
WHERE processed = false AND failed = false
ORDER BY "createdAt" ASC
LIMIT 10
FOR UPDATE SKIP LOCKED
```

**`FOR UPDATE SKIP LOCKED`** prevents race conditions if multiple auth-service instances run simultaneously — each instance picks up different rows.

### Circuit Breaker for Kafka

The outbox poller implements a **circuit breaker** to prevent hammering a downed Kafka broker:

| State | Behavior |
| :--- | :--- |
| **CLOSED** (normal) | Poll Postgres, emit to Kafka, mark processed |
| **OPEN** (tripped) | Skip polling entirely until `circuitOpenUntil` timestamp passes |

**Trip conditions:**
- Each failed Kafka emit increments `consecutiveFailures`
- When `consecutiveFailures >= 3` → circuit opens for `backoffMs` duration
- `backoffMs` doubles on each trip: 5s → 10s → 20s → 40s → 60s (capped at `MAX_BACKOFF_MS = 60000`)
- On any successful emit → `consecutiveFailures = 0`, `backoffMs = 5000` (full reset)

**Poison-pill protection:** Each event has a `retryCount`. After 5 failed attempts, the event is marked `failed = true` and excluded from future polls. This prevents a single malformed event from blocking the entire outbox.

**Kafka emit timeout:** Each `kafka.emit()` is wrapped in `Promise.race` with a 5-second timeout.

**Source:** [`plugins/outbox.ts:1-150`](file:///c:/Users/sachin%20lakshitha/devop/services/auth/src/plugins/outbox.ts)

### Non-Blocking Kafka Initialization

The Kafka producer is initialized in `onReady` hook as a **fire-and-forget** promise. If Kafka is unreachable at startup, the service starts normally and handles requests. The producer initializes in the background, and the outbox poller skips cycles until `fastify.kafka.isProducerReady === true`.

**Source:** [`plugins/kafka.ts:22-29`](file:///c:/Users/sachin%20lakshitha/devop/services/auth/src/plugins/kafka.ts#L22-L29)

---

## 14. Health Registry

The auth service exposes `GET /health` with a cached, multi-probe health check:

**Probes:**
| Check | What It Tests |
| :--- | :--- |
| `redis` | `redis.ping()` |
| `db` | `prisma.$queryRaw\`SELECT 1\`` |
| `kafka` | `fastify.kafka.isProducerReady` |

**Caching:** Results are cached for **30 seconds** (`cacheTtlMs`) to avoid hammering dependencies on every health check poll.

**Response:** `status: "ok"` (all up, HTTP 200) or `status: "degraded"` (any down, HTTP 503).

```json
{
  "status": "degraded",
  "service": "auth-service",
  "checks": { "redis": "up", "db": "up", "kafka": "down" },
  "timestamp": "2026-09-03T08:30:00.000Z"
}
```

**Source:** [`utils/health.ts:1-125`](file:///c:/Users/sachin%20lakshitha/devop/services/auth/src/utils/health.ts)

---

## 15. Prometheus Metrics

Exposed at `GET /metrics` (Prometheus scrape endpoint).

| Metric | Type | Labels | What It Tracks |
| :--- | :--- | :--- | :--- |
| `auth_login_total` | Counter | `outcome` | Login attempts by result: `success`, `invalid_credentials`, `account_locked`, `mfa_required`, `error` |
| `auth_register_total` | Counter | `outcome` | Registration attempts by result: `success`, `user_exists`, `error` |
| `auth_login_duration_seconds` | Histogram | — | End-to-end login latency (includes Argon2 hash verification) |
| `http_request_duration_seconds` | Histogram | `method`, `route`, `status_code` | General HTTP request duration (auto-recorded via `onResponse` hook) |

**Source:** [`plugins/metrics.ts:1-56`](file:///c:/Users/sachin%20lakshitha/devop/services/auth/src/plugins/metrics.ts)

---

## 16. Security Audit Trail

Every critical auth action creates an immutable record in the `SecurityLog` Postgres table:

| Action | When |
| :--- | :--- |
| `REGISTER` | User successfully registers |
| `LOGIN_SUCCESS` | Successful password verification |
| `LOGIN_FAILED` | Wrong password or missing user |
| `LOCKOUT` | Account locked after 5 failed attempts |
| `LOGOUT` | Single-session logout |
| `LOGOUT_ALL` | All-session logout |
| `PASSWORD_RESET` | Password changed via reset flow |
| `REVOCATION_BREACH` | Refresh token replay detected — all sessions nuked |

Each log entry includes: `userId`, `action`, `ip`, `userAgent`, `metadata` (JSON), `createdAt`.

Queryable by users via `GET /security-log` (paginated, their own logs only).

---

## 17. Redis Key Reference

Complete reference of all Redis keys used by the auth service:

| Key Pattern | TTL | Purpose |
| :--- | :--- | :--- |
| `auth:refresh:{userId}:{tokenHash}` | 30 days | Active refresh token session |
| `auth:denylist:jti:{jti}` | 15 minutes | Revoked access token JTI |
| `auth:fails:{email}` | 15 minutes | Failed login attempt counter |
| `auth:lockout:{email}` | 15 minutes | Account lockout flag |
| `auth:verify-email:{token}` | 24 hours | Email verification token → userId |
| `auth:reset-password:{token}` | 1 hour | Password reset token → userId |
| `auth:exchange:{token}` | 60 seconds | OAuth single-use exchange token → userId |
