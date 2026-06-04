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
