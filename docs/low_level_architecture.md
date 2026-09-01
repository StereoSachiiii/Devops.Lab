# Low-Level Architecture

## 1. Corrections to high_level_architecture.md

No corrections to the high-level architecture were found during the low-level trace. All major boundaries, dependencies, and communication paths defined in `high_level_architecture.md` are accurate at the implementation level.

---

## 2. Resolution of Prior Open Questions

**a. Does notification-service consume from Kafka, RabbitMQ, or both?**
It consumes from **both**.

- **Kafka**: It binds to the `identity.user.registered` and `identity.email.verify` topics (using consumer group `group.notifications`). Its Kafka consumer does not send emails directly; instead, it transforms the Kafka event payload and publishes a job to RabbitMQ (`services/notification/src/consumers.ts`, line 9-31).
- **RabbitMQ**: It consumes from the `send.email` queue. This consumer is the one that actually executes the `nodemailer` tasks (`sendWelcomeEmail` / `sendVerificationEmail`) (`services/notification/src/consumers.ts`, line 33-44).

**b. How does sandbox-worker's `/validate` route actually work?**
It **executes a script inside the running container**.
The route calls `val.Check` which invokes `v.docker.Exec(ctx, containerID, []string{"/bin/bash", "/validator.sh"})` (`services/sandbox/internal/validator/validator.go`, line 63).

- An exit code of `0` means the challenge passed; `1` means it failed; `2+` means the validator script crashed.
- It parses the script's `stdout`. If the output is a JSON array, it parses structured per-check results (e.g., `[{"check_id": "port_80", "passed": true...}]`). If it is plain text, it creates a single synthetic "overall" check result using the text as feedback, providing backward compatibility for older challenge images (`services/sandbox/internal/validator/validator.go`, line 103-123).

**c. Do auth-service, core-service, and sandbox-worker share the Postgres public schema?**
**Yes.**

- `auth-service` and `core-service` use Prisma with the shared `@devops/db` package (`packages/db/prisma/schema.prisma`), which generates tables in the default `public` schema (no `@@schema` specified).
- `sandbox-worker` connects via `sqlx` and issues raw SQL queries quoting exact Prisma-generated table names without any schema prefix (e.g., `UPDATE "Submission"`, `INSERT INTO "ChallengeCheckResult"`) (`services/sandbox/internal/db/client.go`, lines 48, 88). This means it is directly writing to the same `public` schema as the Node.js services.

---

## 3. Message & Event Schemas

The canonical definitions for messaging payloads are located in `packages/messaging/types.ts`.

**Kafka Topics & Payloads:**

- `identity.user.registered`
  - Payload: `{ userId: string; email: string; name: string | null; }`
- `identity.email.verify`
  - Payload: `{ userId: string; email: string; token: string; }`
- `sandbox.session.started`
  - Payload: `{ type: 'session.started'; sessionId: string; userId: string; challengeId: string; image: string; ttlMins: number; }`
- `sandbox.session.ended`
  - Payload: `{ type: 'session.ended'; sessionId: string; reason: 'completed' | 'terminated' | 'expired'; }`
- `curriculum.challenge.solved`
  - Payload: `{ submissionId: string; challengeId: string; userId: string; passed: true; stdout: string; stderr: string; exitCode: number; durationMs: number; }`
- `curriculum.challenge.failed`
  - Payload: `{ submissionId: string; challengeId: string; userId: string; passed: false; stdout: string; stderr: string; exitCode: number; durationMs: number; }`
- `curriculum.quiz.completed`
  - _Declared as a topic string, but no Event class or payload mapping exists in `EventClassMap`. Unclear if used._

**RabbitMQ Queues:**

- `provision.sandbox` (Payload mirrors `sandbox.session.started` event)
- `terminate.sandbox` (Payload mirrors `sandbox.session.ended` event)
- `send.email` (Payload: `{ type: 'welcome' | 'verification'; userId: string; email: string; token?: string; }`)

---

## 4. API Contract Summary (Kong Routes)

| Service            | Method   | Route                            | Auth Required | Request / Response Summary                                           |
| :----------------- | :------- | :------------------------------- | :------------ | :------------------------------------------------------------------- |
| **core-service**   | `GET`    | `/api/challenges`                | No            | Ret: Array of challenges                                             |
| **core-service**   | `GET`    | `/api/challenges/:id`            | No            | Ret: Challenge details including module context                      |
| **core-service**   | `POST`   | `/api/challenges/:id/start`      | Yes           | Req: None. Ret: `sessionId`, `terminalUrl`, `validateUrl`, `ttlMins` |
| **core-service**   | `GET`    | `/api/session/:id`               | Yes           | Ret: Session status and URLs                                         |
| **core-service**   | `DELETE` | `/api/session/:id`               | Yes           | Ret: 204 No Content                                                  |
| **core-service**   | `GET`    | `/api/session/:id/health`        | Yes           | Ret: `{ alive: boolean }` (Proxies to sandbox-worker)                |
| **core-service**   | `GET`    | `/api/session/:id/check-results` | Yes           | Ret: Array of persisted challenge check results                      |
| **auth-service**   | `POST`   | `/api/auth/register`             | No            | Req: User details.                                                   |
| **auth-service**   | `POST`   | `/api/auth/login`                | No            | Req: Credentials.                                                    |
| **auth-service**   | `GET`    | `/api/auth/me`                   | Yes           | Ret: Current user profile                                            |
| **sandbox-worker** | `GET`    | `/sessions/:id/terminal`         | Yes (JWT)     | Upgrades to WebSocket.                                               |
| **sandbox-worker** | `POST`   | `/validate/:id`                  | No (Internal) | Trigger challenge validation. Ret: JSON validation results.          |

---

## 5. Core Mechanical Flows

### Starting a Challenge Session (Traced)

1. **Concurrency Check**: `POST /challenges/:id/start` (`services/core/src/modules/challenge/challenge.routes.ts`) first queries `LabSession` to ensure the user hasn't exceeded their plan's concurrent session limit (1 for Free, 3 for Pro, 5 for Team).
2. **Idempotency Lock**: Acquires an atomic lock using Redis `SET NX` with key `core:session:{userId}:{challengeId}`. If the key exists, it aborts the provisioning and returns the existing cached session details.
3. **Database Transaction**: Opens a Prisma transaction to write the `LabSession` (status: `ACTIVE`) and insert an `OutboxEvent` (type: `SessionStartedEvent`). **If this fails, the Redis lock is explicitly deleted and a 500 is returned.**
4. **Best-Effort Broker Publish**: Emits to Kafka (`SessionStartedEvent`) and RabbitMQ (`provision.sandbox`).
5. **Mark Processed**: If the emit succeeds, it updates the `OutboxEvent` to `processed: true`. If it throws an error, the error is swallowed (logged as warning), relying on the outbox poller to handle retries later.

---

## 6. Container Provisioning Mechanics

Sandbox provisioning is handled by `DockerProvider` (`services/sandbox/internal/sandbox/docker.go`).

- **Base Command**: Containers are started with `Cmd: []string{"sleep", "infinity"}`, meaning they idle until terminal/exec commands are issued.
- **Network & Security**:
  - `NetworkDisabled: true` is set initially on the ContainerConfig.
  - `NetworkMode` defaults to `"none"` (read from the `DOCKER_NETWORK_MODE` environment variable).
  - `SecurityOpt: []string{"no-new-privileges:true"}` and `CapDrop: []string{"ALL"}` are strictly applied.
  - `ReadonlyRootfs` is explicitly `false` (lab environments require writable filesystems).
- **Resources**: Reads `memoryBytes` and `nanoCPUs` and enforces them via Docker limits.
- **Failure Handling**: If `client.ContainerStart` fails, the code immediately issues a `client.ContainerRemove` with `Force: true` to prevent orphaned stopped containers.

---

## 7. WebSocket / Terminal Session Mechanics

Terminal persistence is fully implemented using **tmux** inside the container (`services/sandbox/internal/terminal/tmux.go`).

1. **Connection**: When a WebSocket hits `/sessions/:id/terminal`, the handler (`internal/terminal/handler.go`) prepares to attach to a PTY.
2. **Tmux Probe**: `tmux.go:StartOrAttach` runs `tmux has-session -t {prefix+sessionID}` inside the container.
   - If `tmux` does not exist in the container image, it gracefully falls back to executing `/bin/bash` directly.
3. **Session Creation**: If the session doesn't exist, it runs `tmux new-session -d -s {prefix+sessionID} /bin/bash` to start a background tmux server.
4. **Attachment**: Finally, it executes `tmux attach-session -t {prefix+sessionID}` and wires the returned PTY streams to the WebSocket.
5. **Reconnection**: If the WebSocket drops, the `tmux attach-session` command dies, but the `new-session` process continues running in the container. Upon reconnection, step 2 finds the existing session and jumps straight to step 4, perfectly resuming the terminal state.

---

## 8. Open Questions / Unverified

- **Missing Event Classes**: `curriculum.quiz.completed` is defined as a topic in the messaging package, but no corresponding Typescript class exists in the `EventClassMap`. Is this event actually published or consumed anywhere?
- **Outbox Race Condition**: In `core-service`'s `POST /challenges/:id/start`, the `OutboxEvent` row is inserted, and then inline publishing is attempted. What happens if the background outbox poller picks up the unprocessed row in the milliseconds before the inline publish finishes? Does the system handle duplicate broker deliveries safely?
