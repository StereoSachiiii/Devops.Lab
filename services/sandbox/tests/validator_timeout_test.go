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

func TestValidator_Timeout(t *testing.T) {
	log := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelError}))
	mock := NewMockProvider()
	
	// Simulate an Exec call that sleeps indefinitely (or much longer than 30s)
	mock.ExecFn = func(ctx context.Context, containerID string, cmd []string) (sandbox.ExecResult, error) {
		select {
		case <-time.After(2 * time.Minute):
			return sandbox.ExecResult{ExitCode: 0, Stdout: "finished"}, nil
		case <-ctx.Done():
			return sandbox.ExecResult{}, ctx.Err()
		}
	}

	val := validator.NewValidator(mock, log)

	// Since validator script timeout is hardcoded to 30s internally, 
	// we will run it and measure if it returns in roughly 30s.
	start := time.Now()
	
	// Pass a context that does NOT timeout quickly to prove the validator's internal context works.
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	_, err := val.Check(ctx, "mock-container", "session-val-test")
	
	duration := time.Since(start)

	if err == nil {
		t.Fatalf("Expected validator to return an error due to timeout, got nil")
	}

	if duration < 30*time.Second || duration > 35*time.Second {
		t.Errorf("Expected timeout duration around 30s, got %v", duration)
	}

	// Verify error contains timeout message
	if err.Error() != "validator script timed out after 30s" {
		t.Errorf("Expected specific timeout error message, got: %v", err)
	}
}
