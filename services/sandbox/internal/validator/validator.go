package validator

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/devops-platform/sandbox/internal/sandbox"
)

const validatorScript = "/validator.sh"

// CheckResult is one sub-check emitted by the validator script.
//
// Script protocol (backward compatible):
//   - If stdout is a JSON array of CheckResult objects → parsed as per-check results.
//   - If stdout is plain text (existing scripts) → treated as overall feedback,
//     and a single synthetic CheckResult is created with checkId="overall".
//
// Example structured output from /validator.sh:
//   [
//     {"check_id": "nginx_running", "passed": true, "message": "nginx is active"},
//     {"check_id": "port_80_open", "passed": false, "message": "port 80 not listening"}
//   ]
type CheckResult struct {
	CheckID string `json:"check_id"`
	Passed  bool   `json:"passed"`
	Message string `json:"message"`
}

// Result is the full validator output.
type Result struct {
	Passed       bool          `json:"passed"`
	Feedback     string        `json:"feedback"`
	ExitCode     int           `json:"exit_code"`
	CheckResults []CheckResult `json:"check_results"`
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
//
// Structured per-check output is parsed from JSON stdout when available.
// Plain-text stdout is treated as overall feedback (backward compatible).
func (v *Validator) Check(ctx context.Context, containerID, sessionID string) (Result, error) {
	v.log.Info("🔍 Running validator", "sessionId", sessionID, "containerID", containerID[:12])

	execCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	result, err := v.docker.Exec(execCtx, containerID, []string{"sh", "-c", "if [ ! -f /validator.sh ]; then echo 'validator script /validator.sh not found in container'; exit 127; fi; exec /bin/bash /validator.sh"})
	if err != nil {
		if execCtx.Err() == context.DeadlineExceeded {
			v.log.Error("Validator script timed out", "sessionId", sessionID, "timeout", "30s")
			return Result{}, fmt.Errorf("validator script timed out after 30s")
		}
		return Result{}, fmt.Errorf("validator: exec failed: %w", err)
	}

	feedback := result.Stdout
	if feedback == "" {
		feedback = result.Stderr
	}

	switch result.ExitCode {
	case 0:
		v.log.Info("✅ Validator passed", "sessionId", sessionID)
		return Result{
			Passed:       true,
			Feedback:     feedback,
			ExitCode:     0,
			CheckResults: parseCheckResults(result.Stdout, true),
		}, nil
	case 1:
		v.log.Info("❌ Validator failed", "sessionId", sessionID, "feedback", feedback)
		return Result{
			Passed:       false,
			Feedback:     feedback,
			ExitCode:     1,
			CheckResults: parseCheckResults(result.Stdout, false),
		}, nil
	case 127:
		v.log.Warn("⚠️ Validator script /validator.sh missing from container", "sessionId", sessionID)
		return Result{
			Passed:   false,
			Feedback: "Validator script /validator.sh was not found inside this container image.",
			ExitCode: 127,
			CheckResults: []CheckResult{
				{
					CheckID: "validator_script_present",
					Passed:  false,
					Message: "Missing /validator.sh in container rootfs",
				},
			},
		}, nil
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

// parseCheckResults attempts to parse structured JSON output from the validator script.
// Falls back to a single synthetic "overall" CheckResult for plain-text output.
func parseCheckResults(stdout string, defaultPassed bool) []CheckResult {
	trimmed := strings.TrimSpace(stdout)
	if strings.HasPrefix(trimmed, "[") {
		var checks []CheckResult
		if err := json.Unmarshal([]byte(trimmed), &checks); err == nil && len(checks) > 0 {
			return checks
		}
	}

	// Plain text output — create a synthetic overall result for backward compat.
	if trimmed == "" {
		return []CheckResult{}
	}
	return []CheckResult{
		{
			CheckID: "overall",
			Passed:  defaultPassed,
			Message: trimmed,
		},
	}
}
