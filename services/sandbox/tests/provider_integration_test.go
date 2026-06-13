package tests

import (
	"context"
	"log/slog"
	"os"
	"testing"
	"time"

	"github.com/devops-platform/sandbox/internal/sandbox"
)

// TestDockerIntegration performs a real end-to-end provision, exec, and removal
// against a local Docker daemon.
//
// Run with: TEST_DOCKER=1 go test -v ./tests
func TestDockerIntegration(t *testing.T) {
	if os.Getenv("TEST_DOCKER") != "1" {
		t.Skip("Skipping Docker integration test; set TEST_DOCKER=1 to run")
	}

	log := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelDebug}))
	
	provider, err := sandbox.NewDockerProvider("bridge", 128, 1.0, log)
	if err != nil {
		t.Fatalf("Failed to initialize Docker provider: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	// 1. Provision a lightweight alpine image
	t.Log("Provisioning container (alpine:latest)...")
	containerID, err := provider.Provision(ctx, "alpine:latest")
	if err != nil {
		t.Fatalf("Provision failed: %v", err)
	}
	t.Logf("✅ Successfully provisioned real Docker container. ID: %s", containerID)

	// Ensure cleanup runs
	defer func() {
		t.Logf("Cleaning up container %s...", containerID)
		if err := provider.Remove(context.Background(), containerID); err != nil {
			t.Errorf("Failed to remove container: %v", err)
		} else {
			t.Log("✅ Container removed.")
		}
	}()

	// 2. Exec a simple command
	t.Log("Executing 'echo hello world' in container...")
	result, err := provider.Exec(ctx, containerID, []string{"echo", "hello world"})
	if err != nil {
		t.Fatalf("Exec failed: %v", err)
	}

	if result.ExitCode != 0 {
		t.Fatalf("Expected exit code 0, got %d. Stderr: %s", result.ExitCode, result.Stderr)
	}

	if result.Stdout != "hello world" && result.Stdout != "hello world\n" {
		t.Fatalf("Expected stdout 'hello world', got %q", result.Stdout)
	}

	t.Log("✅ Exec succeeded. Stdout matches.")
}

// TestFlintlockIntegration performs a real end-to-end provision, exec, and removal
// against a Flintlock daemon.
//
// Run with: TEST_FLINTLOCK=1 FLINTLOCK_ADDRESS=localhost:9090 FLINTLOCK_SSH_KEY_PATH=/path/to/key go test -v ./tests
func TestFlintlockIntegration(t *testing.T) {
	if os.Getenv("TEST_FLINTLOCK") != "1" {
		t.Skip("Skipping Flintlock integration test; set TEST_FLINTLOCK=1 to run")
	}

	log := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelDebug}))
	
	address := os.Getenv("FLINTLOCK_ADDRESS")
	if address == "" {
		address = "localhost:9090"
	}

	provider, err := sandbox.NewFlintlockProvider(address, log)
	if err != nil {
		t.Fatalf("Failed to initialize Flintlock provider: %v", err)
	}
	defer provider.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	// 1. Provision an alpine rootfs microVM
	t.Log("Provisioning microVM (alpine:latest)...")
	vmID, err := provider.Provision(ctx, "alpine:latest")
	if err != nil {
		t.Fatalf("Provision failed: %v", err)
	}
	t.Logf("✅ Successfully provisioned real Flintlock microVM. UID: %s", vmID)

	// Ensure cleanup runs
	defer func() {
		t.Logf("Cleaning up microVM %s...", vmID)
		if err := provider.Remove(context.Background(), vmID); err != nil {
			t.Errorf("Failed to remove microVM: %v", err)
		} else {
			t.Log("✅ microVM removed.")
		}
	}()

	// 2. Exec a simple command via SSH
	// Note: microVM boot takes time, so we need a short retry loop for SSH reachability.
	t.Log("Executing 'echo hello world' in microVM via SSH (waiting for boot)...")
	
	var result sandbox.ExecResult
	var execErr error
	for attempt := 1; attempt <= 10; attempt++ {
		result, execErr = provider.Exec(ctx, vmID, []string{"echo", "hello world"})
		if execErr == nil {
			break
		}
		t.Logf("SSH attempt %d failed: %v. Retrying in 2s...", attempt, execErr)
		time.Sleep(2 * time.Second)
	}

	if execErr != nil {
		t.Fatalf("Exec failed after retries: %v", execErr)
	}

	if result.ExitCode != 0 {
		t.Fatalf("Expected exit code 0, got %d. Stderr: %s", result.ExitCode, result.Stderr)
	}

	if result.Stdout != "hello world" && result.Stdout != "hello world\n" {
		t.Fatalf("Expected stdout 'hello world', got %q", result.Stdout)
	}

	t.Log("✅ Exec via SSH succeeded. Stdout matches.")
}

// TestKataIntegration verifies the KataProvider attempts to provision using the
// secure Kata Containers runtime. If Kata is not installed, it should cleanly fail.
//
// Run with: TEST_KATA=1 go test -v ./tests
func TestKataIntegration(t *testing.T) {
	if os.Getenv("TEST_KATA") != "1" {
		t.Skip("Skipping Kata integration test; set TEST_KATA=1 to run")
	}

	log := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelDebug}))

	provider, err := sandbox.NewKataProvider("bridge", 128, 1.0, log)
	if err != nil {
		t.Fatalf("Kata initialization failed: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	containerID, err := provider.Provision(ctx, "alpine:latest")
	if err != nil {
		t.Fatalf("Provision failed: %v", err)
	}
	t.Logf("✅ Successfully provisioned Kata container. ID: %s", containerID)

	defer func() {
		if err := provider.Remove(context.Background(), containerID); err != nil {
			t.Errorf("Failed to remove container: %v", err)
		}
	}()
}

// TestGVisorIntegration verifies the GVisorProvider attempts to provision using the
// secure runsc runtime. If gVisor is not installed, it should cleanly fail.
//
// Run with: TEST_GVISOR=1 go test -v ./tests
func TestGVisorIntegration(t *testing.T) {
	if os.Getenv("TEST_GVISOR") != "1" {
		t.Skip("Skipping gVisor integration test; set TEST_GVISOR=1 to run")
	}

	log := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelDebug}))

	provider, err := sandbox.NewGVisorProvider("bridge", 128, 1.0, log)
	if err != nil {
		t.Fatalf("gVisor initialization failed: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	containerID, err := provider.Provision(ctx, "alpine:latest")
	if err != nil {
		t.Fatalf("Provision failed: %v", err)
	}
	t.Logf("✅ Successfully provisioned gVisor container. ID: %s", containerID)

	defer func() {
		if err := provider.Remove(context.Background(), containerID); err != nil {
			t.Errorf("Failed to remove container: %v", err)
		}
	}()
}
