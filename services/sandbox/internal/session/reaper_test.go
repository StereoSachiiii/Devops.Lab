package session

import (
	"context"
	"io"
	"log/slog"
	"os"
	"sync/atomic"
	"testing"
	"time"

	"github.com/devops-platform/sandbox/internal/sandbox"
	"github.com/devops-platform/sandbox/internal/store"
)

type mockTestProvider struct {
	reapOrphansCalled atomic.Int32
	removeCalled      atomic.Int32
	isRunning         bool
}

func (m *mockTestProvider) Provision(ctx context.Context, image string) (string, error) {
	return "test-container-id", nil
}

func (m *mockTestProvider) Exec(ctx context.Context, containerID string, cmd []string) (sandbox.ExecResult, error) {
	return sandbox.ExecResult{}, nil
}

func (m *mockTestProvider) ExecInteractive(ctx context.Context, containerID string, cols, rows uint) (io.ReadWriteCloser, sandbox.ResizeFunc, error) {
	return nil, func(cols, rows uint) error { return nil }, nil
}

func (m *mockTestProvider) ExecInteractiveCmd(ctx context.Context, containerID string, cols, rows uint, cmd []string) (io.ReadWriteCloser, sandbox.ResizeFunc, error) {
	return nil, func(cols, rows uint) error { return nil }, nil
}

func (m *mockTestProvider) Remove(ctx context.Context, containerID string) error {
	m.removeCalled.Add(1)
	return nil
}

func (m *mockTestProvider) IsRunning(ctx context.Context, containerID string) (bool, error) {
	return m.isRunning, nil
}

func (m *mockTestProvider) EnforceDiskQuotas(ctx context.Context, maxBytes int64) ([]string, error) {
	return nil, nil
}

func (m *mockTestProvider) ReapOrphans(ctx context.Context, activeSessionIDs map[string]struct{}, minAge time.Duration) ([]string, error) {
	m.reapOrphansCalled.Add(1)
	return []string{"orphan-container-1"}, nil
}

func TestReaperSweep_ExpiredSessionAndOrphans(t *testing.T) {
	log := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelDebug}))
	mgr := NewTestManager()
	mgr.log = log

	prov := &mockTestProvider{isRunning: true}
	mgr.SetTestProvider("docker", prov)

	// Add an expired session
	expiredSessionID := "sess-expired-123"
	mgr.AddTestSession(store.SessionData{
		SessionID: expiredSessionID,
		RuntimeID: "container-expired-123",
		Provider:  "docker",
		CreatedAt: time.Now().UTC().Add(-2 * time.Hour),
	})

	reaper := NewReaper(mgr, 30*time.Minute, log)
	reaper.Sweep(context.Background())

	// Expired session should have been removed
	if prov.removeCalled.Load() < 1 {
		t.Errorf("Expected Remove to be called for expired session, got %d", prov.removeCalled.Load())
	}

	// Daemon orphan sweep should have been invoked
	if prov.reapOrphansCalled.Load() < 1 {
		t.Errorf("Expected ReapOrphans to be called on provider, got %d", prov.reapOrphansCalled.Load())
	}

	// Verify session was destroyed in manager
	active := mgr.AllActive()
	for _, s := range active {
		if s.SessionID == expiredSessionID {
			t.Errorf("Expected session %s to be reaped and absent from manager", expiredSessionID)
		}
	}
}

func TestReaperSweep_PrematureDeadContainer(t *testing.T) {
	log := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelDebug}))
	mgr := NewTestManager()
	mgr.log = log

	prov := &mockTestProvider{isRunning: false} // Container died prematurely
	mgr.SetTestProvider("docker", prov)

	deadSessionID := "sess-dead-456"
	mgr.AddTestSession(store.SessionData{
		SessionID: deadSessionID,
		RuntimeID: "container-dead-456",
		Provider:  "docker",
		CreatedAt: time.Now().UTC(), // Young session, but process died
	})

	reaper := NewReaper(mgr, 30*time.Minute, log)
	reaper.Sweep(context.Background())

	if prov.removeCalled.Load() < 1 {
		t.Errorf("Expected Remove to be called for dead session container, got %d", prov.removeCalled.Load())
	}

	active := mgr.AllActive()
	for _, s := range active {
		if s.SessionID == deadSessionID {
			t.Errorf("Expected dead session %s to be destroyed, but still present", deadSessionID)
		}
	}
}
