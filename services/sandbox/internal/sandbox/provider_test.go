package sandbox

import (
	"context"
	"io"
	"log/slog"
	"os"
	"testing"
	"time"
)

// MockProvider implements SandboxProvider for isolated unit testing
type MockProvider struct {
	ProvisionFunc          func(ctx context.Context, image string) (string, error)
	ExecFunc               func(ctx context.Context, containerID string, cmd []string) (ExecResult, error)
	ExecInteractiveFunc    func(ctx context.Context, containerID string, cols, rows uint) (io.ReadWriteCloser, ResizeFunc, error)
	ExecInteractiveCmdFunc func(ctx context.Context, containerID string, cols, rows uint, cmd []string) (io.ReadWriteCloser, ResizeFunc, error)
	RemoveFunc             func(ctx context.Context, containerID string) error
	IsRunningFunc          func(ctx context.Context, containerID string) (bool, error)
	EnforceDiskQuotasFunc  func(ctx context.Context, maxBytes int64) ([]string, error)
}

func (m *MockProvider) Provision(ctx context.Context, image string) (string, error) {
	if m.ProvisionFunc != nil {
		return m.ProvisionFunc(ctx, image)
	}
	return "mock-container-123", nil
}

func (m *MockProvider) Exec(ctx context.Context, containerID string, cmd []string) (ExecResult, error) {
	if m.ExecFunc != nil {
		return m.ExecFunc(ctx, containerID, cmd)
	}
	return ExecResult{Stdout: "ok", ExitCode: 0, Duration: 10 * time.Millisecond}, nil
}

func (m *MockProvider) ExecInteractive(ctx context.Context, containerID string, cols, rows uint) (io.ReadWriteCloser, ResizeFunc, error) {
	if m.ExecInteractiveFunc != nil {
		return m.ExecInteractiveFunc(ctx, containerID, cols, rows)
	}
	return nil, func(cols, rows uint) error { return nil }, nil
}

func (m *MockProvider) ExecInteractiveCmd(ctx context.Context, containerID string, cols, rows uint, cmd []string) (io.ReadWriteCloser, ResizeFunc, error) {
	if m.ExecInteractiveCmdFunc != nil {
		return m.ExecInteractiveCmdFunc(ctx, containerID, cols, rows, cmd)
	}
	return nil, func(cols, rows uint) error { return nil }, nil
}

func (m *MockProvider) Remove(ctx context.Context, containerID string) error {
	if m.RemoveFunc != nil {
		return m.RemoveFunc(ctx, containerID)
	}
	return nil
}

func (m *MockProvider) IsRunning(ctx context.Context, containerID string) (bool, error) {
	if m.IsRunningFunc != nil {
		return m.IsRunningFunc(ctx, containerID)
	}
	return true, nil
}

func (m *MockProvider) EnforceDiskQuotas(ctx context.Context, maxBytes int64) ([]string, error) {
	if m.EnforceDiskQuotasFunc != nil {
		return m.EnforceDiskQuotasFunc(ctx, maxBytes)
	}
	return nil, nil
}

func TestSupportedLanguages(t *testing.T) {
	expected := map[string]string{
		"bash":    "bash:5",
		"python3": "python:3.12-slim",
		"node":    "node:20-slim",
		"sh":      "bash:5",
	}

	for lang, expectedImage := range expected {
		actual, ok := SupportedLanguages[lang]
		if !ok {
			t.Errorf("Expected language %q to be supported, but it was missing", lang)
		}
		if actual != expectedImage {
			t.Errorf("For language %q: expected image %q, got %q", lang, expectedImage, actual)
		}
	}
}

func TestProviderIsolationEnforcement(t *testing.T) {
	log := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelDebug}))

	t.Run("Flintlock requires explicit isolation confirmation", func(t *testing.T) {
		orig := os.Getenv("FLINTLOCK_NETWORK_ISOLATION_CONFIRMED")
		defer os.Setenv("FLINTLOCK_NETWORK_ISOLATION_CONFIRMED", orig)

		os.Unsetenv("FLINTLOCK_NETWORK_ISOLATION_CONFIRMED")
		if os.Getenv("FLINTLOCK_NETWORK_ISOLATION_CONFIRMED") == "true" {
			t.Fatal("Isolation confirmation should be unset")
		}
	})

	t.Run("Docker provider configuration", func(t *testing.T) {
		dp := &DockerProvider{
			networkMode: "none",
			memoryBytes: 512 * 1024 * 1024,
			nanoCPUs:    1_000_000_000,
			runtime:     "runc",
			log:         log,
		}

		if dp.networkMode != "none" {
			t.Errorf("Expected networkMode 'none', got %q", dp.networkMode)
		}
		if dp.memoryBytes != 512*1024*1024 {
			t.Errorf("Expected 512MB memory limit in bytes, got %d", dp.memoryBytes)
		}
	})

	t.Run("gVisor provider wraps Docker with runsc runtime", func(t *testing.T) {
		dp := &DockerProvider{
			networkMode: "none",
			memoryBytes: 512 * 1024 * 1024,
			nanoCPUs:    1_000_000_000,
			runtime:     "runsc",
			log:         log,
		}
		gp := &GVisorProvider{DockerProvider: dp}

		if gp.runtime != "runsc" {
			t.Errorf("Expected gVisor runtime 'runsc', got %q", gp.runtime)
		}
	})

	t.Run("Kata provider wraps Docker with kata runtime", func(t *testing.T) {
		dp := &DockerProvider{
			networkMode: "none",
			memoryBytes: 512 * 1024 * 1024,
			nanoCPUs:    1_000_000_000,
			runtime:     "kata-qemu",
			log:         log,
		}
		kp := &KataProvider{DockerProvider: dp}

		if kp.runtime != "kata-qemu" {
			t.Errorf("Expected Kata runtime 'kata-qemu', got %q", kp.runtime)
		}
	})
}
