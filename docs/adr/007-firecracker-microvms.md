# ADR 007: Firecracker MicroVMs via containerd Shim

## Decision

Use Firecracker microVMs for sandbox isolation. Manage them through containerd's Firecracker shim — we talk to containerd, it handles Firecracker under the hood.

Not everything needs a VM. Docker stays for lightweight challenges (bash, nginx, file ops). Firecracker for heavy isolation (kernel modules, untrusted code, privilege escalation).

## Why containerd shim

- Ignite: simpler but stale maintenance
- Direct Firecracker API: vsock/network/lifecycle complexity is too much
- containerd shim: production-grade, handles VM lifecycle

## Endpoints

- `/sessions/` — Docker container routes (existing)
- `/vm/create` — provision Firecracker VM
- `/vm/{key}/terminal` — terminal into VM
- `/vm/{key}/validate` — validator in VM

## Config

- `ENABLE_FIRECRACKER` flag (default off)
- `CONTAINERD_SOCKET` path (default /run/containerd/containerd.sock)
- Disabled = VM endpoints return 501

> [!NOTE]
> **Reconciled with Codebase (2026-09-23)**
> - **Classification:** STALE
> - **Previous text claimed:** MicroVMs are managed via a containerd Firecracker shim using dedicated `/vm/*` HTTP endpoints.
> - **Actual code behavior:** The codebase implemented MicroVMs using **Flintlock** (`services/sandbox/internal/sandbox/flintlock.go`), communicating over gRPC with a Flintlock daemon (`FLINTLOCK_ADDRESS`). Terminal and validation use the unified `/sessions/{id}/terminal` and `/validate/{id}` routes via the `SandboxProvider` abstraction, not separate `/vm/*` endpoints.
> - **Source of truth:** [`services/sandbox/internal/sandbox/flintlock.go`](file:///c:/Users/sachin%20lakshitha/devop/services/sandbox/internal/sandbox/flintlock.go) and [`services/sandbox/main.go:83-92`](file:///c:/Users/sachin%20lakshitha/devop/services/sandbox/main.go#L83-L92)
> - **Why this matters:** If you try calling `/vm/create` or `/vm/{key}/terminal`, you'll get 404s. The platform abstracts all sandbox backends behind the same `/sessions` routes.

---
