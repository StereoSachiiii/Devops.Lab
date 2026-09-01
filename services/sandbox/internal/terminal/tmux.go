package terminal

import (
	"context"
	"fmt"
	"io"
	"log/slog"

	"github.com/devops-platform/sandbox/internal/sandbox"
)

// TmuxSession wraps the tmux session lifecycle inside a container.
//
// Architecture rationale (from design report, Part 4):
//   The user's shell runs inside tmux, not directly as the pty target.
//   This means the WebSocket connects to a client that attaches to the tmux
//   session, not to the raw shell. When the WebSocket drops (WiFi blip,
//   laptop sleep, tab closed), the tmux session keeps running server-side.
//   On reconnect, the client re-attaches to the same tmux session and sees
//   exactly the scrollback and running process state it left.
//
// Requirement: tmux must be installed inside the challenge container image.
// If tmux is not available, StartOrAttach falls back to a direct /bin/bash exec
// with a warning, so the system degrades gracefully rather than failing hard.

const (
	// tmuxBin is the expected tmux binary path inside the container.
	tmuxBin = "tmux"

	// sessionPrefix is prepended to the sessionID to form the tmux session name.
	// e.g. challenge-3f2e1a4b
	sessionPrefix = "challenge-"
)

// StartOrAttach attaches to an existing tmux session inside the container, or
// creates a new one if it doesn't exist yet.
//
// The returned ReadWriteCloser is the raw PTY stream of the tmux attach process.
// The caller (handler.go) bridges this to the WebSocket exactly as before.
func StartOrAttach(
	ctx context.Context,
	provider sandbox.SandboxProvider,
	containerID, sessionID string,
	cols, rows uint,
	log *slog.Logger,
) (io.ReadWriteCloser, sandbox.ResizeFunc, error) {
	tmuxSession := sessionPrefix + sessionID

	// First, check if a tmux session already exists for this session.
	// `tmux has-session` exits 0 if it exists, 1 if not.
	probe, err := provider.Exec(ctx, containerID, []string{tmuxBin, "has-session", "-t", tmuxSession})
	if err != nil {
		// If tmux itself isn't found, fall back to direct /bin/bash gracefully.
		log.Warn("tmux probe failed — falling back to direct shell exec (tmux not in image?)",
			"sessionId", sessionID,
			"error", err,
		)
		return provider.ExecInteractive(ctx, containerID, cols, rows)
	}

	if probe.ExitCode != 0 {
		// No existing session — create a new detached one.
		// -d: start detached so this exec call returns immediately.
		// -s: session name.
		// /bin/bash: the shell to start inside the session.
		create, err := provider.Exec(ctx, containerID, []string{
			tmuxBin, "new-session", "-d", "-s", tmuxSession, "/bin/sh",
		})
		if err != nil || create.ExitCode != 0 {
			log.Warn("tmux new-session failed — falling back to direct shell exec",
				"sessionId", sessionID,
				"exitCode", create.ExitCode,
				"stderr", create.Stderr,
			)
			return provider.ExecInteractive(ctx, containerID, cols, rows)
		}
		log.Info("tmux session created", "sessionId", sessionID, "tmuxSession", tmuxSession)
	} else {
		log.Info("tmux session already exists — re-attaching", "sessionId", sessionID, "tmuxSession", tmuxSession)
	}

	// Attach to the tmux session interactively. This is what connects the
	// browser's WebSocket to the user's live shell (and any running processes).
	//
	// -t: target session name.
	// The PTY opened here is what the browser sees as the terminal.
	pty, resizeFn, err := provider.ExecInteractiveCmd(ctx, containerID, cols, rows,
		[]string{tmuxBin, "attach-session", "-t", tmuxSession},
	)
	if err != nil {
		// Last resort: plain shell
		log.Warn("tmux attach-session failed — falling back to direct shell exec",
			"sessionId", sessionID,
			"error", err,
		)
		return provider.ExecInteractive(ctx, containerID, cols, rows)
	}

	return pty, resizeFn, nil
}

// KillSession tears down the tmux session inside the container.
// Called when the sandbox session is intentionally destroyed (not on disconnect).
func KillSession(ctx context.Context, provider sandbox.SandboxProvider, containerID, sessionID string, log *slog.Logger) {
	tmuxSession := sessionPrefix + sessionID
	result, err := provider.Exec(ctx, containerID, []string{tmuxBin, "kill-session", "-t", tmuxSession})
	if err != nil || result.ExitCode != 0 {
		log.Warn("tmux kill-session returned non-zero (session may already be gone)",
			"sessionId", sessionID,
			"exitCode", result.ExitCode,
		)
		return
	}
	log.Info("tmux session killed", "sessionId", sessionID)

	// Suppress unused import — fmt used in the fallback error below (kept for future use)
	_ = fmt.Sprintf
}
