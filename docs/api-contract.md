# Shared API Contract & Service Endpoints

This document provides a unified reference for the API contract across all microservices (`auth`, `core`, `sandbox`, and `notification`). It details the endpoints, request/response bodies, and HTTP status codes.

---

## 1. Auth Service (`/api/auth`, `/api/me`)

Handles authentication, sessions, account recovery, and MFA.

| Endpoint                        | Method | Request Body (JSON)                                                  | Response (JSON)                     |
| ------------------------------- | ------ | -------------------------------------------------------------------- | ----------------------------------- |
| `/api/auth/me`                  | `GET`  | _None_                                                               | `UserProfile`                       |
| `/api/auth/me`                  | `PUT`  | `{ "name": "string", "jobTitle": "string" }`                         | `StandardResponse`                  |
| `/api/auth/login`               | `POST` | `{ "email": "user@example.com", "password": "pwd" }`                 | `AuthSuccessResponse`               |
| `/api/auth/register`            | `POST` | `{ "name": "User", "email": "user@example.com", "password": "pwd" }` | `AuthSuccessResponse`               |
| `/api/auth/login/mfa`           | `POST` | `{ "mfaToken": "jwt...", "code": "123456" }`                         | `AuthSuccessResponse`               |
| `/api/auth/logout`              | `POST` | _None_                                                               | `StandardResponse`                  |
| `/api/auth/logout-all`          | `POST` | _None_                                                               | `StandardResponse`                  |
| `/api/auth/refresh`             | `POST` | _None_                                                               | `StandardResponse`                  |
| `/api/auth/sessions`            | `GET`  | _None_                                                               | `ActiveSession[]`                   |
| `/api/auth/sessions/:id/revoke` | `POST` | _None_                                                               | `StandardResponse`                  |
| `/api/auth/security-log`        | `GET`  | _None_                                                               | `SecurityLogResponse`               |
| `/api/auth/mfa/setup`           | `POST` | _None_                                                               | `MfaSetupResponse` (qrCode, secret) |
| `/api/auth/mfa/verify`          | `POST` | `{ "code": "123456" }`                                               | `StandardResponse`                  |
| `/api/auth/verify-email`        | `POST` | `{ "token": "abc..." }`                                              | `StandardResponse`                  |
| `/api/auth/forgot-password`     | `POST` | `{ "email": "user@example.com" }`                                    | `StandardResponse`                  |
| `/api/auth/reset-password`      | `POST` | `{ "token": "abc...", "password": "new" }`                           | `StandardResponse`                  |

### Security & Rate Limiting (Auth)
- **Rate Limiting (Kong)**: The gateway enforces **100 req/sec** per IP. Exceeding this returns `429 Too Many Requests`.
- **Account Lockout**: **5 failed login attempts** lock the account for 15 minutes. Returns `429` with `ACCOUNT_LOCKED`.
- **Token Rotation & Grace Period**: Refresh tokens are rotated upon use. Concurrent requests within a **10-second grace period** are honored. Reusing an old token outside this window triggers a `SESSION_COMPROMISED` breach, revoking all active user sessions instantly.

### Standard Auth Error Codes
Error responses follow the `AppErrorSchema` or `ValidationErrorSchema`.
- `USER_EXISTS` (400): Email is already registered.
- `ACCOUNT_LOCKED` (429): Account locked due to 5 failed attempts.
- `REFRESH_TOKEN_MISSING` (401): Cookie is missing or malformed.
- `SESSION_EXPIRED` (401): Token is stale, forged, naturally expired, or missing in Redis.
- `SESSION_COMPROMISED` (401): Detected a token replay attack (used outside grace period). All sessions nuked.

---

## 2. Core Service (`/api/challenges`, `/api/content`, `/api/assistant`, etc)

Handles challenges, learning paths, quizzes, and user progress/leaderboard.

| Endpoint                          | Method | Request Body (JSON)                   | Response (JSON)                        |
| --------------------------------- | ------ | ------------------------------------- | -------------------------------------- |
| `/api/challenges`                 | `GET`  | _None_                                | `Challenge[]`                          |
| `/api/challenges/:id`             | `GET`  | _None_                                | `Challenge`                            |
| `/api/challenges/:id/start`       | `POST` | _None_                                | `Session` (starts a sandbox container) |
| `/api/session/:id`                | `GET`  | _None_                                | `Session`                              |
| `/api/content/nodes/:id`          | `GET`  | _None_                                | `Node`                                 |
| `/api/content/quizzes`            | `GET`  | _None_                                | `QuizNode[]`                           |
| `/api/content/quizzes/:id/submit` | `POST` | `{ "answers": { "q1": 0, "q2": 1 } }` | `SubmitResponse`                       |
| `/api/leaderboard`                | `GET`  | _None_                                | `LeaderboardResponse`                  |
| `/api/dashboard`                  | `GET`  | _None_                                | `DashboardData`                        |
| `/api/assistant/chat`             | `POST` | `{ "message": "How do I exit vim?" }` | `{ "content": "..." }`                 |

---

## 3. Sandbox Service (Golang)

Responsible for lifecycle and validation of Kata/Docker/gVisor containers.
_Note: Terminals run via websockets on `/sessions/{id}/terminal`._

| Endpoint                | Method | Request Body (JSON) | Response (JSON)                                           |
| ----------------------- | ------ | ------------------- | --------------------------------------------------------- |
| `/validate/{sessionId}` | `POST` | _None_              | `ValidationResponse` (200 OK or 422 Unprocessable Entity) |
| `/health`               | `GET`  | _None_              | `{ "status": "ok" }`                                      |

---

## 4. Notification Service

This service is entirely **Event-Driven** and does not expose a public HTTP API, except for an internal `/health` check.
It consumes events from RabbitMQ and Kafka (such as `UserRegisteredEvent` or `EmailVerificationRequestedEvent` originating from the Core's Outbox pattern).

---

## Standard JSON Payload Examples

### `UserProfile` (Auth/Me)

```json
{
  "id": "uuid-123",
  "name": "Jane Doe",
  "email": "jane@example.com",
  "role": "ADMIN",
  "xp": 1500,
  "mfaEnabled": true,
  "avatarUrl": "https://example.com/avatar.png"
}
```

### `AuthSuccessResponse` (Auth Login/Register)

```json
{
  "token": "eyJhbG...",
  "user": {
    "id": "uuid-123",
    "email": "jane@example.com",
    "role": "LEARNER",
    "orgId": "org-456"
  }
}
```

### `AppErrorResponse` (Standard application errors)

```json
{
  "error": "Account locked due to too many failed attempts. Try again later.",
  "code": "ACCOUNT_LOCKED"
}
```

### `ValidationErrorResponse` (Fastify schema validation)

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "body/password must NOT have fewer than 8 characters"
}
```

### `Challenge` (Core)

```json
{
  "id": "chal-1",
  "title": "Intro to Docker",
  "description": "Learn the basics of containers.",
  "difficulty": "JUNIOR",
  "category": "DOCKER",
  "tags": ["docker", "containers"],
  "xp": 100,
  "dockerImage": "nginx:latest"
}
```

### `ValidationResponse` (Sandbox Validation)

```json
{
  "passed": true,
  "feedback": "Great job configuring the port!",
  "checkResults": [
    {
      "checkId": "chk-1",
      "passed": true,
      "message": "Nginx is running on port 80"
    }
  ]
}
```

### `StandardResponse`

Used universally across services for `200 OK` responses without payload data to ensure strict typescript typing.

```json
{
  "success": true,
  "message": "Optional descriptive message."
}
```

---

## 5. Messaging Brokers (Kafka & RabbitMQ)

The system relies on asynchronous messaging for decoupling services. Below are the canonical definitions for topics, queues, and event payloads (defined in `@devops/messaging/types.ts`).

### Kafka Topics & Event Payloads

All Kafka events inherit a `BaseEvent` wrapper that includes `version`, `timestamp`, and `correlationId`.

| Topic                         | Publisher     | Consumers       | Description                                                   |
| ----------------------------- | ------------- | --------------- | ------------------------------------------------------------- |
| `identity.user.registered`    | Auth (Outbox) | Notification    | Emitted when a new user signs up.                             |
| `identity.email.verification` | Auth (Outbox) | Notification    | Emitted when an email verification link is requested.         |
| `sandbox.challenge.solved`    | Sandbox       | Core (Progress) | Emitted when a user successfully passes all challenge checks. |
| `sandbox.challenge.failed`    | Sandbox       | Core (Progress) | Emitted when a user fails a challenge attempt.                |
| `sandbox.session.started`     | Core          | Sandbox         | Emitted when a user starts a challenge session.               |
| `sandbox.session.ended`       | Sandbox, Core | Progress        | Emitted when a session completes, terminates, or expires.     |

**Payload: `UserRegisteredEvent`**

```json
{
  "userId": "uuid-123",
  "email": "jane@example.com",
  "name": "Jane Doe"
}
```

**Payload: `EmailVerificationRequestedEvent`**

```json
{
  "userId": "uuid-123",
  "email": "jane@example.com",
  "token": "abc-123-def"
}
```

**Payload: `ChallengeSolvedEvent` / `ChallengeFailedEvent`**

```json
{
  "submissionId": "sess-456",
  "challengeId": "chal-1",
  "userId": "uuid-123",
  "passed": true,
  "stdout": "...",
  "stderr": "",
  "exitCode": 0,
  "durationMs": 1500
}
```

**Payload: `SessionStartedEvent`**

```json
{
  "type": "session.started",
  "sessionId": "sess-456",
  "userId": "uuid-123",
  "challengeId": "chal-1",
  "image": "nginx:latest",
  "ttlMins": 60
}
```

**Payload: `SessionEndedEvent`**

```json
{
  "type": "session.ended",
  "sessionId": "sess-456",
  "reason": "completed" // or "terminated", "expired"
}
```

### RabbitMQ Queues

| Queue               | Publisher     | Consumers    | Description                                                          |
| ------------------- | ------------- | ------------ | -------------------------------------------------------------------- |
| `provision.sandbox` | Core          | Sandbox      | Commands the Sandbox service to provision a new environment.         |
| `terminate.sandbox` | Core          | Sandbox      | Commands the Sandbox service to terminate an existing environment.   |
| `send.email`        | Auth (Outbox) | Notification | Commands the Notification service to dispatch a transactional email. |
