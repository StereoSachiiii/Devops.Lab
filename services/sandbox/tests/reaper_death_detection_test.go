package tests

import (
	"context"
	"log/slog"
	"os"
	"testing"
	"time"

	"github.com/devops-platform/sandbox/internal/session"
)

func TestReaper_ProactiveDeathDetection(t *testing.T) {
	r, _ := setupRedis(t)
	defer r.Close()

	log := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelError}))
	mock := NewMockProvider()

	mgr, err := session.NewManager(mock, r, 60, "worker-mock:8090", log)
	if err != nil {
		t.Fatalf("Failed to create manager: %v", err)
	}

	ctx := context.Background()
	sessionID := "test-session-reaper"

	// 1. Create a session
	_, err = mgr.Create(ctx, sessionID, "user-reaper", "chal-1", "alpine")
	if err != nil {
		t.Fatalf("Create failed: %v", err)
	}

	// Verify session exists
	data, _ := mgr.Get(ctx, sessionID)
	if data == nil {
		t.Fatalf("Session should exist after create")
	}

	reaper := session.NewReaper(mgr, 60*time.Minute, log)

	// 2. Run sweep while container is "running"
	mock.RunningFlag = true
	reaper.Sweep(ctx)

	// Verify session STILL exists
	data, _ = mgr.Get(ctx, sessionID)
	if data == nil {
		t.Fatalf("Session was improperly reaped while container was supposedly running")
	}

	// 3. Simulate container death
	mock.RunningFlag = false

	// Run sweep again
	reaper.Sweep(ctx)

	// Verify session is NOW gone
	data, _ = mgr.Get(ctx, sessionID)
	if data != nil {
		t.Fatalf("Session was NOT reaped after container death was detected")
	}
}
