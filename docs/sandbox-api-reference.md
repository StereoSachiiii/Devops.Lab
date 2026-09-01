# Sandbox Service API Reference

This document provides a consumer-facing reference for integrating with the Sandbox Service (`sandbox-worker`).

---

## 1. WebSocket Terminal Connection

The primary interface for interactive sandbox sessions. Provides a bidirectional stream for terminal output (PTY) and input, as well as JSON control frames.

**Endpoint:** `GET /sessions/{sessionId}/terminal`  
**Protocol:** WebSocket (`ws://` or `wss://`)  
**Auth Requirement:** RS256 JWT Token (via `Authorization: Bearer <token>`, `?token=<token>` query parameter, or `token` Cookie).

### 1.1 Request Parameters

| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `sessionId` | Path | **Yes** | The UUID of the provisioned sandbox session. |
| `cols` | Query | No | Initial terminal columns (default: 220). |
| `rows` | Query | No | Initial terminal rows (default: 50). |
| `token` | Query | No | Alternative way to pass JWT token. |

### 1.2 Access Control & Responses

| Condition | Status Code | Response Body / Behavior |
| :--- | :--- | :--- |
| Valid connection | `101 Switching Protocols` | WebSocket upgrades successfully. |
| Missing Session ID | `400 Bad Request` | `"missing session ID\n"` |
| Missing/Invalid JWT | `401 Unauthorized` | `"unauthorized\n"` |
| Revoked/Denylisted JWT | `401 Unauthorized` | `"unauthorized: token revoked\n"` |
| JWT Subject != Owner | `403 Forbidden` | `"forbidden\n"` |
| Session not found | `404 Not Found` | `"session not found\n"` |

### 1.2.1 Access Token Denylist & Fail-Open Resilience
Upon verifying the RS256 JWT signature, `sandbox-worker` checks Redis key `auth:denylist:jti:${jti}` using a strict 250ms context timeout:
- **Denylisted Token**: Returns `401 Unauthorized` (`"unauthorized: token revoked"`).
- **Valid Active Token**: Upgrades to WebSocket terminal stream.
- **Redis Error / Unreachable / Timeout (Fail-Open Policy)**: If Redis is down or slow, `sandbox-worker` logs a warning (`"Redis denylist check failed/timed out, failing open"`) and allows valid RS256 tokens through. This design decision ensures live terminal connections are never dropped due to Redis infrastructure outages.

### 1.3 Control Frame Protocol (JSON)

Before and during the binary PTY stream, the server emits text frames containing JSON control messages. 

#### Progress Events
Emitted during the provisioning lifecycle.

```json
{
  "type": "progress",
  "sessionId": "sess-1234",
  "stage": "IMAGE_PULL_START | IMAGE_PULL_COMPLETE | CONTAINER_CREATED | CONTAINER_STARTED | TMUX_ATTACHED | READY",
  "message": "Human readable description",
  "timestamp": 1722624000000
}
```

#### TTL Warning
Emitted exactly 5 minutes before the session expires (or at the halfway mark for sessions < 10 mins).

```json
{
  "type": "ttl_warning",
  "minutesRemaining": 5
}
```

#### Client-to-Server Resize Event
The client should send a text JSON frame when the user resizes their terminal window.

```json
{
  "type": "resize",
  "cols": 120,
  "rows": 40
}
```

#### Ping / Pong Event
The client and server can exchange ping/pong frames to keep the connection alive.

**Client to Server:**
```json
{
  "type": "ping"
}
```
**Server to Client:**
```json
{
  "type": "pong"
}
```

#### Error Frame
Sent when a terminal connection encounters an error (e.g. provisioning timed out or forbidden access during wait loop).
```json
{
  "type": "error",
  "message": "Provisioning timed out"
}
```

### 1.4 Binary PTY Stream

Once the `READY` progress event is emitted, all subsequent binary frames received from the server contain raw PTY output (stdout/stderr). Any binary frames sent by the client are piped directly to the shell's `stdin`.

---

## 2. HTTP Endpoints

### 2.1 Health Check (Session specific)

Check if a specific session and its underlying sandbox container are alive and reachable.

**Endpoint:** `GET /sessions/{sessionID}/health`  
**Auth Requirement:** Validated identically to the `/terminal` endpoint via JWT token.

#### Responses

| Status Code | Condition | Response Body |
| :--- | :--- | :--- |
| `200 OK` | Session is alive | `{"alive": true}` |
| `200 OK` | Session is dead / not found | `{"alive": false}` |
| `400 Bad Request` | Missing Session ID | `{"alive": false, "error": "missing session ID"}` |
| `401 Unauthorized` | Invalid JWT Token | `{"alive": false}` |
| `403 Forbidden` | JWT Subject != Owner | `{"alive": false}` |

### 2.2 Challenge Validation

Executes `/validator.sh` inside the active container.

**Endpoint:** `POST /validate/{sessionId}`  
**Auth Requirement:** None (Internal endpoint triggered by Core service/API Gateway).

#### Responses

| Status Code | Condition | Response Body |
| :--- | :--- | :--- |
| `200 OK` | Validation passed (Exit Code 0) | `{"passed": true, "feedback": "..."}` |
| `422 Unprocessable Entity`| Validation failed (Exit Code != 0) | `{"passed": false, "feedback": "..."}` |
| `400 Bad Request` | Missing Session ID | `"missing session ID\n"` |
| `404 Not Found` | Session does not exist | `"session not found\n"` |
| `405 Method Not Allowed` | Wrong HTTP method used | `"method not allowed\n"` |
| `500 Internal Server Error`| Validator script crashed/timeout | `"validator error\n"` |

### 2.3 General Health Check & Metrics

**Endpoint:** `GET /health`  
**Response:** `200 OK` `{"status":"ok"}`

**Endpoint:** `GET /metrics`  
**Response:** Prometheus metrics for the worker.

---

## 3. RabbitMQ Message Contracts

The Sandbox Service consumes jobs from RabbitMQ to orchestrate container lifecycles.

### 3.1 Provision Sandbox (`provision.sandbox.{provider}`)

**Queue:** `provision.sandbox.{provider}` (e.g., `provision.sandbox.docker`)  
**DLQ:** `provision.sandbox.{provider}.dlq`

```json
{
  "type": "session.started",
  "sessionId": "string",
  "userId": "string",
  "challengeId": "string",
  "image": "string",
  "ttlMins": 60
}
```

### 3.2 Terminate Sandbox (`terminate.sandbox`)

**Queue:** `terminate.sandbox`  
**DLQ:** `terminate.sandbox.dlq`

```json
{
  "type": "session.ended",
  "sessionId": "string",
  "reason": "user_left | timeout"
}
```
