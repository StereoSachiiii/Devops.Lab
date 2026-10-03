# ADR 009: Hybrid Sandbox Strategy

## Decision

Docker for lightweight challenges. Firecracker for heavy isolation. Both live in the sandbox service.

Challenge definition specifies which runtime. `SandboxProvider` interface extended with `ProvisionVM` and `GetVMStatus`. Docker returns `ErrVMNotSupported` for VM ops.

## Endpoints

Docker:

- `GET /sessions/{id}/terminal` — WebSocket into container
- `POST /validate/{id}` — run validator in container

Firecracker:

- `POST /vm/create` — provision VM, returns vmKey
- `GET /vm/{key}` — status
- `GET /vm/{key}/terminal` — WebSocket into VM
- `POST /vm/{key}/validate` — run validator in VM

> [!NOTE]
> **Reconciled with Codebase (2026-09-23)**
> - **Classification:** STALE
> - **Previous text claimed:** Hybrid execution adds dedicated `/vm/*` endpoints for Firecracker microVMs and separate config flags (`ENABLE_FIRECRACKER`).
> - **Actual code behavior:** The unified `SandboxProvider` interface abstracts all engines (Docker, gVisor, Kata, Flintlock) behind the existing `/sessions/{id}/terminal` and `/validate/{id}` routes. `core-service` selects the provider dynamically based on `challenge.requiredProvider`.
> - **Source of truth:** [`services/sandbox/internal/sandbox/provider.go`](file:///c:/Users/sachin%20lakshitha/devop/services/sandbox/internal/sandbox/provider.go) and [`services/core/src/modules/challenge/challenge.routes.ts:312`](file:///c:/Users/sachin%20lakshitha/devop/services/core/src/modules/challenge/challenge.routes.ts#L312)
> - **Why this matters:** There is no separate API client or frontend code path needed for microVM challenges. Everything flows through the standard session lifecycle.

---

## Health

Check Docker daemon + containerd socket + Redis + Postgres + Kafka. Cached 30s TTL.

## Graceful degradation

- Firecracker disabled (flag off) → VM endpoints 501
- Docker unreachable → container endpoints 503
- Service starts even if one provider down

## Implementation order

1. Config (ENABLE_FIRECRACKER, CONTAINERD_SOCKET)
2. Extend SandboxProvider interface
3. Redis store ownership fields + methods
4. FirecrackerProvider via containerd
5. Hybrid HTTP endpoints
6. Health checks
7. Graceful degradation
8. Metrics
9. Tests
