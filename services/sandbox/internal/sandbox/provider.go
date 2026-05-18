package sandbox

import (
	"context"
	"io"
	"time"
)

// SupportedLanguages maps language identifiers to Docker images.
var SupportedLanguages = map[string]string{
	"bash":    "bash:5",
	"python3": "python:3.12-slim",
	"node":    "node:20-slim",
	"sh":      "bash:5",
}

// ExecResult holds the output of a non-interactive exec command.
type ExecResult struct {
	Stdout   string
	Stderr   string
	ExitCode int
	Duration time.Duration
}

// SandboxProvider is the abstraction over execution backends.
// MVP: DockerProvider. Future: GVisorProvider, FirecrackerProvider.
type SandboxProvider interface {
	// Provision creates a container from the given image and starts it.
	// The container runs `sleep infinity` — it stays alive until Remove() is called.
	// Returns the containerID which the caller must store and use for subsequent calls.
	Provision(ctx context.Context, image string) (containerID string, err error)

	// Exec runs a command inside a running container and returns the output.
	// Used for: validator scripts, one-off commands.
	// Non-interactive — no PTY, no stdin.
	Exec(ctx context.Context, containerID string, cmd []string) (ExecResult, error)

	// ExecInteractive opens a PTY (pseudo-terminal) inside a running container.
	// Returns a ReadWriteCloser: write keystrokes in, read terminal output out.
	// Used for: WebSocket terminal bridge.
	// Caller must Close() the returned connection when the terminal session ends.
	ExecInteractive(ctx context.Context, containerID string, cols, rows uint) (io.ReadWriteCloser, ResizeFunc, error)

	// Remove force-removes a container. Called on session end or TTL expiry.
	Remove(ctx context.Context, containerID string) error
}

// ResizeFunc resizes the PTY when the browser window is resized.
type ResizeFunc func(cols, rows uint) error
