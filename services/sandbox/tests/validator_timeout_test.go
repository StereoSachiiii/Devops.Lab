package tests

import (
	"context"
	"log/slog"
	"os"
	"testing"
	"time"

	"github.com/devops-platform/sandbox/internal/sandbox"
	"github.com/devops-platform/sandbox/internal/validator"
)

// TestValidator_Timeout verifies that the validator enforces its own 30s internal deadline
// regardless of the parent context's deadline.
//
// This test intentionally takes ~30s to complete. Run with sufficient timeout:
//
//	go test ./tests/... -run TestValidator_Timeout -timeout 90s -v
func TestValidator_Timeout(t *testing.T) {
	// Guard: skip if the remaining test-suite time budget is too tight.
	// A -timeout 30s flag (or shorter) races against the validator's own 30s
	// internal deadline and causes the suite to panic before we can assert.
	deadline, ok := t.Deadline()
	if ok && time.Until(deadline) < 60*time.Second {
		t.Skip("Skipping TestValidator_Timeout: suite timeout is too short (<60s remaining). Re-run with -timeout 90s")
	}

	log := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelError}))
	mock := NewMockProvider()

	// Simulate an Exec call that sleeps indefinitely (much longer than 30s).
	mock.ExecFn = func(ctx context.Context, containerID string, cmd []string) (sandbox.ExecResult, error) {
		select {
		case <-time.After(2 * time.Minute):
			return sandbox.ExecResult{ExitCode: 0, Stdout: "finished"}, nil
		case <-ctx.Done():
			return sandbox.ExecResult{}, ctx.Err()
		}
	}

	val := validator.NewValidatorWithProvider(mock, log)

	// Pass a context that does NOT timeout quickly — the validator's own internal
	// 30s execCtx should be the thing that fires, not this parent context.
	start := time.Now()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	_, err := val.Check(ctx, "mock-container", "session-val-test")

	duration := time.Since(start)

	if err == nil {
		t.Fatalf("Expected validator to return an error due to timeout, got nil")
	}

	// Allow 28–36s window: validator fires at 30s, OS scheduling adds jitter.
	if duration < 28*time.Second || duration > 36*time.Second {
		t.Errorf("Expected timeout duration around 30s, got %v", duration)
	}

	if err.Error() != "validator script timed out after 30s" {
		t.Errorf("Expected specific timeout error message, got: %v", err)
	}
}
