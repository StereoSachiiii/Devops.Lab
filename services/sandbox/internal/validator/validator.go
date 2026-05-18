package validator

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/devops-platform/sandbox/internal/sandbox"
)

const validatorScript = "/validator.sh"

// Result is the output of running the challenge validator.
type Result struct {
	Passed   bool
	Feedback string // shown to the user in the UI
	ExitCode int
}

// Validator runs challenge validator scripts inside containers.
type Validator struct {
	docker sandbox.SandboxProvider
	log    *slog.Logger
}

// NewValidator creates a Validator.
func NewValidator(docker sandbox.SandboxProvider, log *slog.Logger) *Validator {
	return &Validator{docker: docker, log: log}
}

// Check runs /validator.sh inside the container and returns the result.
// The validator script must:
//   - Exit 0  → challenge passed
//   - Exit 1  → challenge failed (stdout is shown as feedback to the user)
//   - Exit 2+ → validator itself errored (infra problem, not user's fault)
func (v *Validator) Check(ctx context.Context, containerID, sessionID string) (Result, error) {
	v.log.Info("🔍 Running validator", "sessionId", sessionID, "containerID", containerID[:12])

	result, err := v.docker.Exec(ctx, containerID, []string{"/bin/bash", validatorScript})
	if err != nil {
		return Result{}, fmt.Errorf("validator: exec failed: %w", err)
	}

	feedback := result.Stdout
	if feedback == "" {
		feedback = result.Stderr
	}

	switch result.ExitCode {
	case 0:
		v.log.Info("✅ Validator passed", "sessionId", sessionID)
		return Result{Passed: true, Feedback: feedback, ExitCode: 0}, nil
	case 1:
		v.log.Info("❌ Validator failed", "sessionId", sessionID, "feedback", feedback)
		return Result{Passed: false, Feedback: feedback, ExitCode: 1}, nil
	default:
		// Exit 2+ = validator script itself broke (missing dependencies, wrong image, etc.)
		v.log.Error("Validator script error",
			"sessionId", sessionID,
			"exitCode", result.ExitCode,
			"stderr", result.Stderr,
		)
		return Result{}, fmt.Errorf("validator script exited with code %d: %s", result.ExitCode, result.Stderr)
	}
}
