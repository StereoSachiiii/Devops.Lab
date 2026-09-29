package tests

import (
	"context"
	"log/slog"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/devops-platform/sandbox/internal/sandbox"
	"github.com/devops-platform/sandbox/internal/session"
	"github.com/devops-platform/sandbox/internal/store"
)

func setupRedis(t *testing.T) (*store.RedisStore, string) {
	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		redisURL = "redis://localhost:6379/0"
	}

	encryptionKey := "0123456789abcdef0123456789abcdef" // 32 bytes for AES-256
	log := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelError}))
	
	r, err := store.NewRedisStore(redisURL, 60, log, []byte(encryptionKey))
	if err != nil {
		t.Skipf("Skipping test, Redis not available at %s: %v", redisURL, err)
	}

	return r, encryptionKey
}

func TestManager_Idempotency(t *testing.T) {
	r, _ := setupRedis(t)
	defer r.Close()

	log := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelError}))
	mock := NewMockProvider()
	mock.ProvisionDelay = 10 * time.Millisecond // simulate slight network delay

	providers := map[string]sandbox.SandboxProvider{"docker": mock}
	mgr, err := session.NewManager(providers, r, 60, "worker-mock:8090", log)
	if err != nil {
		t.Fatalf("Failed to create manager: %v", err)
	}

	ctx := context.Background()
	sessionID := "test-session-idempotency"

	// Clean up any old state first
	_ = mgr.Destroy(ctx, sessionID)

	// Call create twice sequentially
	_, err = mgr.Create(ctx, sessionID, "user-1", "chal-1", "alpine", "docker")
	if err != nil {
		t.Fatalf("Create 1 failed: %v", err)
	}

	_, err = mgr.Create(ctx, sessionID, "user-1", "chal-1", "alpine", "docker")
	if err != nil {
		t.Fatalf("Create 2 failed: %v", err)
	}

	if mock.GetProvisionCount() != 1 {
		t.Errorf("Expected Provision to be called exactly 1 time, got %d", mock.GetProvisionCount())
	}

	_ = mgr.Destroy(ctx, sessionID)
}

func TestManager_ConcurrentProvisioningSafety(t *testing.T) {
	r, _ := setupRedis(t)
	defer r.Close()

	log := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelError}))
	mock := NewMockProvider()
	// simulate a slow provision to ensure we hit the concurrency lock
	mock.ProvisionDelay = 50 * time.Millisecond

	providers := map[string]sandbox.SandboxProvider{"docker": mock}
	mgr, err := session.NewManager(providers, r, 60, "worker-mock:8090", log)
	if err != nil {
		t.Fatalf("Failed to create manager: %v", err)
	}

	ctx := context.Background()
	sessionID := "test-session-concurrent"

	// Clean up any old state first
	_ = mgr.Destroy(ctx, sessionID)

	var wg sync.WaitGroup
	workers := 50
	wg.Add(workers)

	// Fire 50 concurrent requests for the exact same session ID
	for i := 0; i < workers; i++ {
		go func() {
			defer wg.Done()
			_, err := mgr.Create(ctx, sessionID, "user-1", "chal-1", "alpine", "docker")
			if err != nil {
				t.Errorf("Concurrent Create failed: %v", err)
			}
		}()
	}

	wg.Wait()

	if mock.GetProvisionCount() != 1 {
		t.Errorf("Concurrency failure: expected exactly 1 Provision call, got %d", mock.GetProvisionCount())
	}

	_ = mgr.Destroy(ctx, sessionID)
}

func TestManager_RedisStateRecovery(t *testing.T) {
	r1, encKey := setupRedis(t)

	log := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelError}))
	mock1 := NewMockProvider()

	providers1 := map[string]sandbox.SandboxProvider{"docker": mock1}
	mgr1, err := session.NewManager(providers1, r1, 60, "worker-mock:8090", log)
	if err != nil {
		t.Fatalf("Failed to create manager 1: %v", err)
	}

	ctx := context.Background()
	sessionID := "test-session-recovery"

	// Clean up any old state first
	_ = mgr1.Destroy(ctx, sessionID)

	data1, err := mgr1.Create(ctx, sessionID, "user-1", "chal-1", "alpine", "docker")
	if err != nil {
		t.Fatalf("Manager 1 create failed: %v", err)
	}

	r1.Close() // simulate process crash/restart

	// Initialize Manager B pointing to the same Redis
	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		redisURL = "redis://localhost:6379/0"
	}
	r2, _ := store.NewRedisStore(redisURL, 60, log, []byte(encKey))
	defer r2.Close()
	
	mock2 := NewMockProvider()
	providers2 := map[string]sandbox.SandboxProvider{"docker": mock2}
	mgr2, err := session.NewManager(providers2, r2, 60, "worker-mock:8090", log)
	if err != nil {
		t.Fatalf("Failed to create manager 2: %v", err)
	}

	data2, err := mgr2.Get(ctx, sessionID)
	if err != nil {
		t.Fatalf("Manager 2 Get failed: %v", err)
	}
	if data2 == nil {
		t.Fatalf("Manager 2 did not recover the session from Redis")
	}

	if data1.RuntimeID != data2.RuntimeID {
		t.Errorf("Recovered runtime ID mismatch. Expected %s, got %s", data1.RuntimeID, data2.RuntimeID)
	}

	_ = mgr2.Destroy(ctx, sessionID)
}

func TestManager_DynamicProviderSelection(t *testing.T) {
	log := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelError}))

	mockDocker := NewMockProvider()
	mockGVisor := NewMockProvider()
	mockKata := NewMockProvider()

	testMgr := session.NewTestManager()
	testMgr.SetTestProvider("docker", mockDocker)
	testMgr.SetTestProvider("gvisor", mockGVisor)
	testMgr.SetTestProvider("kata", mockKata)

	// 1. Resolve by name
	p1 := testMgr.GetProviderByName("docker")
	if p1 != mockDocker {
		t.Errorf("Expected mockDocker for 'docker', got %v", p1)
	}
	p2 := testMgr.GetProviderByName("gvisor")
	if p2 != mockGVisor {
		t.Errorf("Expected mockGVisor for 'gvisor', got %v", p2)
	}
	p3 := testMgr.GetProviderByName("kata")
	if p3 != mockKata {
		t.Errorf("Expected mockKata for 'kata', got %v", p3)
	}
	pFallback := testMgr.GetProviderByName("unknown-provider")
	if pFallback != mockDocker {
		t.Errorf("Expected fallback to mockDocker for unknown provider, got %v", pFallback)
	}

	// 2. Resolve per session
	testMgr.AddTestSession(store.SessionData{
		SessionID:   "session-docker-1",
		RuntimeID:   "cid-1",
		Provider:    "docker",
	})
	testMgr.AddTestSession(store.SessionData{
		SessionID:   "session-gvisor-1",
		RuntimeID:   "cid-2",
		Provider:    "gvisor",
	})
	testMgr.AddTestSession(store.SessionData{
		SessionID:   "session-kata-1",
		RuntimeID:   "cid-3",
		Provider:    "kata",
	})

	resolved1, err := testMgr.GetProvider("session-docker-1")
	if err != nil || resolved1 != mockDocker {
		t.Errorf("Expected mockDocker for session-docker-1, got %v (err: %v)", resolved1, err)
	}

	resolved2, err := testMgr.GetProvider("session-gvisor-1")
	if err != nil || resolved2 != mockGVisor {
		t.Errorf("Expected mockGVisor for session-gvisor-1, got %v (err: %v)", resolved2, err)
	}

	resolved3, err := testMgr.GetProvider("session-kata-1")
	if err != nil || resolved3 != mockKata {
		t.Errorf("Expected mockKata for session-kata-1, got %v (err: %v)", resolved3, err)
	}
	_ = log
}
