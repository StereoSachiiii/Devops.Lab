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
