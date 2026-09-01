#!/usr/bin/env bash
set -eo pipefail

# =============================================================================
# DevOps Platform - Host-Native Sandbox Worker Runner
# =============================================================================
# Why sandbox-worker cannot fully leave Docker:
# - The sandbox manager dynamically creates and destroys isolated Linux
#   container environments to evaluate user challenge code.
# - The daemon itself runs as a fast, native Go process on the host, but
#   communicates with the host Docker engine via /var/run/docker.sock.
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$ROOT_DIR/services/sandbox"
echo "🛠️ Starting host-native Go Sandbox Worker daemon on :8090..."
go run main.go
