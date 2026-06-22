package session

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"

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

	// In-memory index for fast lookup without a Redis round-trip on every terminal message.
	// Redis is the source of truth; this is a cache.
	mu       sync.RWMutex
	sessions map[string]store.SessionData
}

// NewManager creates a Manager and re-adopts any sessions already in Redis
// (handles Go service restart without orphaning running containers).
func NewManager(provider sandbox.SandboxProvider, redis *store.RedisStore, ttlMins int, log *slog.Logger) (*Manager, error) {
	m := &Manager{
		provider: provider,
		redis:    redis,
		ttl:      time.Duration(ttlMins) * time.Minute,
		log:      log,
		sessions: make(map[string]store.SessionData),
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

	return m, nil
}

// Create provisions a new container and registers the session in Redis + memory.
func (m *Manager) Create(ctx context.Context, sessionID, userID, challengeID, image string) (*store.SessionData, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Idempotency: if session already exists (duplicate event), return existing
	if existing, ok := m.sessions[sessionID]; ok {
		m.log.Warn("Session already exists, returning existing", "sessionId", sessionID)
		return &existing, nil
	}

	m.log.Info("Provisioning container for session",
		"sessionId", sessionID,
		"image", image,
		"userId", userID,
	)

	containerID, err := m.provider.Provision(ctx, image)
	if err != nil {
		return nil, fmt.Errorf("session create: provision failed: %w", err)
	}

	data := store.SessionData{
		SessionID:   sessionID,
		ContainerID: containerID,
		UserID:      userID,
		ChallengeID: challengeID,
		Image:       image,
		CreatedAt:   time.Now().UTC(),
	}

	if err := m.redis.Save(ctx, data); err != nil {
		// Best-effort: container is running, but we couldn't save to Redis.
		// Clean up the container to avoid an orphan.
		_ = m.provider.Remove(ctx, containerID)
		return nil, fmt.Errorf("session create: redis save failed: %w", err)
	}

	m.sessions[sessionID] = data
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
	m.mu.Unlock()

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
