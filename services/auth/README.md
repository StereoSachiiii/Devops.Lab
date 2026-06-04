# Auth Service

## Features

### 1. User Registration & Authentication
- Email/Password registration
- Secure password hashing using Argon2
- JWT-based authentication with RS256 asymmetric keys
- Short-lived access tokens and long-lived refresh tokens

### 2. Multi-Factor Authentication (MFA)
- TOTP-based MFA setup with QR code generation
- MFA verification and enforcement during login
- Two-step MFA login flow (Temporary token → MFA Code → Full Session)

### 3. Session & Security Management
- Redis-backed refresh token storage
- Refresh token rotation
- Replay attack detection (invalidates all sessions if an old refresh token is reused)
- Brute-force protection (temporary account lockout after 5 failed attempts)
- Comprehensive security logging (login success/failures, lockouts, revocation breaches)
- Single session logout and global "logout all" capabilities

### 4. Account Recovery & Verification
- Email verification flow with expiring Redis tokens
- Forgot password / Password reset flow with secure temporary tokens
- Change password capability for currently authenticated users

### 5. User Profile Management
- Fetching current user details
- Updating basic profile information (e.g., name)
- Account deletion (with automated cleanup of related security logs, sessions, and outbox events)

### 6. Event-Driven Architecture
- Transactional outbox pattern for reliable event publishing to Kafka
- Emits asynchronous events: `UserRegisteredEvent`, `EmailVerificationRequestedEvent`, `PasswordResetRequestedEvent`, `UserDeletedEvent`

### 7. Internal Service Infrastructure
- Public key distribution endpoint (`/public-key`) for other microservices to verify JWTs
- Health check endpoint (`/health`) with cached dependency checks (Redis, DB)
- Prometheus metrics endpoint (`/metrics`) with auth-specific counters and histograms
- Fully configurable timeouts, expirations, and thresholds via environment variables

### 8. Third-Party Identity Providers (SSO)
- GitHub OAuth2 integration with automatic email resolution (including private verified emails)
- Google OAuth2 integration
- Automated user creation and linkage using existing email addresses
- Emits asynchronous `UserRegisteredEvent` for new OAuth users

### 9. Observability
- Structured logging via Pino → Loki
- Distributed tracing via OpenTelemetry → Tempo
- Prometheus metrics: `auth_login_total`, `auth_register_total`, `auth_login_duration_seconds`, `http_request_duration_seconds`
- Default system metrics (CPU, memory, GC) via prom-client
