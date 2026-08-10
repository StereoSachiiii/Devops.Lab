# Authentication Service Deep-Dive (`services/auth`)

This document exhaustively details the architecture, security mechanics, and cryptographic implementations of the Authentication Service.

## 1. Cryptography & Hashing

### 1.1 Password Hashing (Argon2)

All user passwords are mathematically one-way hashed using the **Argon2** algorithm, which is the current industry standard (winner of the Password Hashing Competition) designed to resist GPU-based cracking attacks.

- **Implementation**: The service directly leverages the `argon2` npm package.
- **Salting**: Argon2 automatically generates a cryptographically secure random salt for every password hash. The salt is embedded directly within the resulting hash string stored in the database.
- **Verification**: `argon2.verify(hash, plainText)` extracts the salt and tuning parameters from the database string to safely verify credentials.

### 1.2 JWT (JSON Web Tokens)

The service utilizes **Asymmetric RS256** signatures for its tokens.

- **Private Key**: `JWT_PRIVATE_KEY` is injected _only_ into the Auth Service. This ensures that even if other microservices are compromised, attackers cannot forge authentication tokens.
- **Public Key**: `JWT_PUBLIC_KEY` is shared with downstream services (e.g. `services/core`) to allow them to independently verify the signature without adding network latency.
- **Access Tokens**: Short-lived (15 minutes). Placed in an HTTP-Only, Secure, SameSite-Lax cookie named `token`.

---

## 2. Session Lifecycle & Revocation Mechanics

The platform implements a highly robust session tracking and token rotation system to prevent replay attacks and session hijacking.

### 2.1 Refresh Token Anatomy

When a user logs in, they are issued a `refreshToken` alongside their access token.

- **Format**: `userId.secret` (e.g., `cuid123.randomHexSecret`).
- **Storage**: The plain secret is returned to the user via a Secure HTTP-Only cookie. The server _does not_ store this secret. Instead, it computes a `sha256` hash of the secret and stores it in **Redis** under the key `auth:refresh:{userId}:{tokenHash}`, with a 30-day expiration.

### 2.2 Token Rotation

When the 15-minute access token expires, the client calls `POST /api/auth/refresh`.

1. The server hashes the presented refresh secret.
2. It checks Redis for the existence of `auth:refresh:{userId}:{tokenHash}`.
3. If it exists, the old Redis key is deleted, and a brand new refresh token (and new access token) is generated and issued.

### 2.3 Revocation & Breach Detection (The Replay Trap)

If a user's refresh token is stolen, both the user and the attacker might try to use it.

- When the token is used the first time, it rotates successfully (the old Redis key is deleted).
- When the _second_ party attempts to use the original stolen token, the server computes the hash, checks Redis, and finds that it **does not exist**.
- **Breach Response**: The system recognizes a `REVOCATION_BREACH`. It instantly runs a wildcard delete on Redis (`auth:refresh:{userId}:*`), destroying **all active sessions** for that user across all devices. It sets `revokedAt` on all PostgreSQL `UserSession` records and logs a `REVOCATION_BREACH` security event. The user must manually log in again.

---

## 3. Persistent Rate Limits, Bans, and Lockouts

### 3.1 Lockout Mechanics (Brute-force Protection)

To protect against credential stuffing and brute-force attacks, the Auth service tracks failed logins in Redis.

- **Fails Key**: `auth:fails:{email}` increments on every invalid password or missing user.
- **Threshold**: If a user hits **5 failed attempts** (`config.security.maxFailedAttempts`), they are locked out.
- **Lockout Action**: A lockout key (`auth:lockout:{email}`) is set in Redis for **1 hour** (`config.expiry.passwordReset`).
- Any subsequent login attempt (even with the correct password) will immediately return `429 ACCOUNT_LOCKED` until the Redis key expires.

### 3.2 Security Audit Trail (Bans/Monitoring)

Every critical action creates an immutable record in the PostgreSQL `SecurityLog` table. This allows administrators to monitor suspicious behavior and permanently ban abusers.
Tracked Actions:

- `REGISTER`, `LOGIN_SUCCESS`, `LOGIN_FAILED`, `LOCKOUT`
- `LOGOUT`, `LOGOUT_ALL`, `PASSWORD_RESET`, `REVOCATION_BREACH`
  These logs include the user's IP Address, User-Agent, and Timestamp.

---

## 4. User Registration Flow

When a user calls `POST /api/auth/register`:

1. **Validation**: Email uniqueness is enforced.
2. **Hashing**: Password is hashed via Argon2.
3. **Transaction**: A single PostgreSQL transaction creates:
   - The `User` record (default role `LEARNER`).
   - A `UserSession` tracking the initial login IPs and user agents.
   - A `SecurityLog` entry (`action: "REGISTER"`).
   - An `OutboxEvent` for `UserRegisteredEvent` (picked up by Kafka to notify other microservices).
   - An `OutboxEvent` for `EmailVerificationRequestedEvent`.
4. **Email Verification**: A UUID verification token is generated and stored in Redis (`auth:verify-email:{token}`) for 24 hours. The user clicks the link to hit `POST /api/auth/verify-email`.

---

## 5. OAuth Integrations (SSO)

The platform supports Single Sign-On via **GitHub** and **Google**, powered by `@fastify/oauth2`.

### 5.1 Callback Flow

1. User authenticates on the provider and is redirected to `/login/{provider}/callback`.
2. The server exchanges the authorization code for an access token.
3. **Email Resolution**: For GitHub, if the email isn't public in the primary profile, the server makes a secondary authenticated call to `https://api.github.com/user/emails` to find the verified primary email.
4. **Upsert Logic (`findOrCreateOAuthUser`)**:
   - The server first attempts to find a user by their `githubId` or `googleId`.
   - If not found, it performs an upsert by email address. This automatically links a new GitHub/Google sign-in to an existing email/password account.
5. **Session**: A standard JWT is generated and returned as an HTTP-Only cookie.

---

## 6. Multi-Factor Authentication (MFA)

- **Setup (`/mfa/setup`)**: Generates a Time-based One-Time Password (TOTP) secret using `otplib` and returns a QR code payload.
- **Login Gate**: When a user with `mfaEnabled: true` logs in with their password, they are _not_ immediately given a session. Instead, they receive a temporary JWT (valid for a few minutes) with a `pendingMfa: true` claim.
- **Verification (`/login/mfa`)**: The user submits the temporary JWT along with the 6-digit TOTP code to fully authenticate and receive their actual access and refresh tokens.

---

## 7. Event Streaming & The Outbox Pattern

Despite the fact that the entire platform uses a single PostgreSQL database (`@devops/db`), the architecture still employs an **Outbox Pattern** when publishing events to Kafka.

### 7.1 Why use the Outbox Pattern with a single DB?

While all microservices share the same Postgres instance, Postgres and Kafka are two completely separate distributed systems. You cannot guarantee a distributed transaction (2-Phase Commit) between them.
If the Auth service successfully inserted the `User` into Postgres and then immediately called `kafka.emit()`, the Kafka publish could fail (network timeout, broker down). In this scenario, the DB would have committed the user, but downstream services (like Notification or Core) would never receive the `UserRegisteredEvent`. This is the classic "Dual Write" problem.

### 7.2 The Implementation

1. **Atomic Transaction**: During registration, the business logic inserts the `User` record _and_ the `OutboxEvent` record in the exact same Postgres transaction.
2. **Guaranteed Delivery**: Because it's a single database transaction, it is fully atomic. If the DB fails, neither record is saved. If it succeeds, the Outbox record is definitively written.
3. **The Relay**: A separate background worker (`plugins/outbox.ts`) constantly polls the `OutboxEvent` table. It reads unprocessed events, reliably publishes them to Kafka, and marks them as `processed: true`.
4. **Resiliency**: If Kafka goes down entirely, registration still succeeds for the user. The events simply queue up in the `OutboxEvent` table and will automatically flow to Kafka the moment it recovers, achieving true eventual consistency.
