package session

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/devops-platform/sandbox/internal/metrics"
	"github.com/devops-platform/sandbox/internal/sandbox"
	"github.com/devops-platform/sandbox/internal/store"
)

// Manager is the control plane for all active sessions.
// It owns the mapping of sessionID → containerID and delegates to the SandboxProvider.
type Manager struct {
	provider sandbox.SandboxProvider
	redis    *store.RedisStore
	ttl      time.Duration
	log      *slog.Logger
	Progress *ProgressTracker

	// In-memory index for fast lookup without a Redis round-trip on every terminal message.
	// Redis is the source of truth; this is a cache.
	mu       sync.RWMutex
	sessions map[string]store.SessionData
	inFlight map[string]*sync.Mutex
	workerAddr string
	IsolationDowngraded bool
}

// NewManager creates a Manager and re-adopts any sessions already in Redis
// (handles Go service restart without orphaning running containers).
func NewManager(provider sandbox.SandboxProvider, redis *store.RedisStore, ttlMins int, workerAddr string, log *slog.Logger) (*Manager, error) {
	m := &Manager{
		provider: provider,
		redis:    redis,
		ttl:      time.Duration(ttlMins) * time.Minute,
		log:      log,
		Progress: NewProgressTracker(),
		sessions: make(map[string]store.SessionData),
		inFlight: make(map[string]*sync.Mutex),
		workerAddr: workerAddr,
	}

	// Re-sync from Redis on startup
	ctx := context.Background()
	existing, err := redis.AllSessions(ctx)
	if err != nil {
		return nil, fmt.Errorf("session manager: redis sync failed: %w", err)
	}

	for _, s := range existing {
		m.sessions[s.SessionID] = s
		m.log.Info("Re-adopted session from Redis", "sessionId", s.SessionID, "containerID", truncateID(s.ContainerID, 12))
	}
	metrics.ActiveContainers.Set(float64(len(m.sessions)))

	return m, nil
}

// TTL returns the configured session TTL.
func (m *Manager) TTL() time.Duration {
	return m.ttl
}

// StartDiskMonitor runs a background loop to scan and enforce disk quotas.
func (m *Manager) StartDiskMonitor(ctx context.Context) {
	ticker := time.NewTicker(10 * time.Second)
	go func() {
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				// 1 GB limit
				killed, err := m.provider.EnforceDiskQuotas(ctx, 1024*1024*1024)
				if err != nil {
					m.log.Error("Failed to enforce disk quotas", "error", err)
				} else if len(killed) > 0 {
					metrics.DiskQuotaKillsTotal.Add(float64(len(killed)))
					m.log.Warn("Enforced disk quota on containers", "count", len(killed), "containers", killed)
				}
			}
		}
	}()
}

// Create provisions a new container and registers the session in Redis + memory.
func (m *Manager) Create(ctx context.Context, sessionID, userID, challengeID, image string) (*store.SessionData, error) {
	// 1. Get or create a per-session mutex
	m.mu.Lock()
	sessionMu, ok := m.inFlight[sessionID]
	if !ok {
		sessionMu = &sync.Mutex{}
		m.inFlight[sessionID] = sessionMu
	}
	m.mu.Unlock()

	// 2. Lock this specific session's creation flow
	sessionMu.Lock()
	defer sessionMu.Unlock()

	// 3. Idempotency: if session already exists (duplicate event), return existing
	m.mu.RLock()
	if existing, ok := m.sessions[sessionID]; ok {
		m.mu.RUnlock()
		m.log.Warn("Session already exists, returning existing", "sessionId", sessionID)
		return &existing, nil
	}
	m.mu.RUnlock()

	m.log.Info("Provisioning container for session",
		"sessionId", sessionID,
		"image", image,
		"userId", userID,
	)

	// Save initial state to Redis so sandbox-router can route WebSocket
	// connections to this worker to stream live progress events.
	initialData := store.SessionData{
		SessionID:   sessionID,
		ContainerID: "provisioning",
		UserID:      userID,
		ChallengeID: challengeID,
		Image:       image,
		CreatedAt:   time.Now().UTC(),
		WorkerAddr:  m.workerAddr,
	}
	_ = m.redis.Save(ctx, initialData)

	if m.IsolationDowngraded {
		m.log.Warn("Downgraded isolation level enforced for session", "sessionId", sessionID, "provider", "docker")
		m.Progress.Publish(sessionID, StageIsolationDowngraded, "Running with standard isolation — enhanced sandboxing unavailable on this host")
	}

	m.Progress.Publish(sessionID, StageImagePullStart, "Pulling container image "+image)

	startProvision := time.Now()
	containerID, err := m.provider.Provision(ctx, image)
	if err != nil {
		return nil, fmt.Errorf("session create: provision failed: %w", err)
	}
	metrics.ProvisionDuration.WithLabelValues("docker", image).Observe(time.Since(startProvision).Seconds())

	m.Progress.Publish(sessionID, StageImagePullComplete, "Container image ready")
	m.Progress.Publish(sessionID, StageContainerCreated, "Created sandbox layer")
	m.Progress.Publish(sessionID, StageContainerStarted, "Sandbox container started")

	data := store.SessionData{
		SessionID:   sessionID,
		ContainerID: containerID,
		UserID:      userID,
		ChallengeID: challengeID,
		Image:       image,
		CreatedAt:   time.Now().UTC(),
		WorkerAddr:  m.workerAddr,
	}

	if err := m.redis.Save(ctx, data); err != nil {
		// Best-effort: container is running, but we couldn't save to Redis.
		// Clean up the container to avoid an orphan.
		_ = m.provider.Remove(ctx, containerID)
		return nil, fmt.Errorf("session create: redis save failed: %w", err)
	}

	m.mu.Lock()
	m.sessions[sessionID] = data
	delete(m.inFlight, sessionID) // clean up the in-flight mutex
	activeCount := float64(len(m.sessions))
	m.mu.Unlock()
	metrics.ActiveContainers.Set(activeCount)
	
	m.log.Info("✅ Session created", "sessionId", sessionID, "containerID", truncateID(containerID, 12))
	return &data, nil
}

// Get returns session data by ID. Checks memory cache first, then Redis.
func (m *Manager) Get(ctx context.Context, sessionID string) (*store.SessionData, error) {
	m.mu.RLock()
	if data, ok := m.sessions[sessionID]; ok {
		m.mu.RUnlock()
		return &data, nil
	}
	m.mu.RUnlock()

	// Not in memory — check Redis (could be on another worker instance)
	if m.redis == nil {
		return nil, nil // session not found
	}
	data, err := m.redis.Get(ctx, sessionID)
	if err != nil {
		return nil, fmt.Errorf("session get: redis lookup failed: %w", err)
	}
	if data == nil {
		return nil, nil // session not found
	}

	return data, nil
}

// Destroy stops and removes the container, then deletes the session from Redis and memory.
func (m *Manager) Destroy(ctx context.Context, sessionID string) error {
	data, err := m.Get(ctx, sessionID)
	if err != nil {
		return err
	}
	if data == nil {
		m.log.Warn("Destroy called on non-existent session", "sessionId", sessionID)
		return nil
	}

	m.log.Info("Destroying session", "sessionId", sessionID, "containerID", truncateID(data.ContainerID, 12))

	// Remove container (best-effort — don't fail if already gone)
	if err := m.provider.Remove(ctx, data.ContainerID); err != nil {
		m.log.Warn("Container remove failed during destroy", "error", err)
	}

	// Clean up Redis
	if err := m.redis.Delete(ctx, sessionID); err != nil {
		m.log.Warn("Redis delete failed during destroy", "error", err)
	}

	// Clean up memory
	m.mu.Lock()
	delete(m.sessions, sessionID)
	activeCount := float64(len(m.sessions))
	m.mu.Unlock()
	metrics.ActiveContainers.Set(activeCount)

	m.log.Info("Session destroyed", "sessionId", sessionID)
	return nil
}

// AllActive returns all sessions currently tracked in memory.
// Used by the reaper.
func (m *Manager) AllActive() []store.SessionData {
	m.mu.RLock()
	defer m.mu.RUnlock()

	sessions := make([]store.SessionData, 0, len(m.sessions))
	for _, s := range m.sessions {
		sessions = append(sessions, s)
	}
	return sessions
}

// truncateID returns the first n characters of id, or the whole string if shorter.
// Used for logging — container IDs and VM UIDs can be long.
func truncateID(id string, n int) string {
	if len(id) <= n {
		return id
	}
	return id[:n]
}

// IsTokenDenylisted checks if an access token JTI is present in the Redis denylist.
// Applies a 250ms context timeout. If Redis is down, unreachable, or times out,
// it logs a warning and returns false (FAIL-OPEN strategy to protect live terminal connections).
func (m *Manager) IsTokenDenylisted(parentCtx context.Context, jti string) bool {
	if jti == "" || m == nil || m.redis == nil {
		return false
	}
	ctx, cancel := context.WithTimeout(parentCtx, 250*time.Millisecond)
	defer cancel()

	denylisted, err := m.redis.IsDenylisted(ctx, jti)
	if err != nil {
		m.log.Warn("Redis denylist check failed/timed out, failing open", "jti", jti, "error", err)
		return false
	}
	return denylisted
}
