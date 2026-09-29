package session

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/devops-platform/sandbox/internal/metrics"
	"github.com/devops-platform/sandbox/internal/sandbox"
	"github.com/devops-platform/sandbox/internal/store"
)

// Manager is the control plane for all active sessions.
// It owns the mapping of sessionID → containerID and delegates to the appropriate SandboxProvider.
type Manager struct {
	providers           map[string]sandbox.SandboxProvider
	defaultProvider     string
	redis               *store.RedisStore
	ttl                 time.Duration
	log                 *slog.Logger
	Progress            *ProgressTracker

	// In-memory index for fast lookup without a Redis round-trip on every terminal message.
	// Redis is the source of truth; this is a cache.
	mu                  sync.RWMutex
	sessions            map[string]store.SessionData
	inFlight            map[string]*sync.Mutex
	workerAddr          string
	IsolationDowngraded bool
}

// NewManager creates a Manager and re-adopts any sessions already in Redis
// (handles Go service restart without orphaning running containers).
// Accepts a map of providers (e.g. "docker", "gvisor", "kata", "flintlock").
func NewManager(providers map[string]sandbox.SandboxProvider, redis *store.RedisStore, ttlMins int, workerAddr string, log *slog.Logger) (*Manager, error) {
	provMap := make(map[string]sandbox.SandboxProvider)
	for k, v := range providers {
		if v != nil {
			provMap[strings.ToLower(strings.TrimSpace(k))] = v
		}
	}
	defaultProv := "docker"
	if _, ok := provMap[defaultProv]; !ok {
		// Pick first available provider if docker not configured
		for k := range provMap {
			defaultProv = k
			break
		}
	}

	m := &Manager{
		providers:       provMap,
		defaultProvider: defaultProv,
		redis:           redis,
		ttl:             time.Duration(ttlMins) * time.Minute,
		log:             log,
		Progress:        NewProgressTracker(),
		sessions:        make(map[string]store.SessionData),
		inFlight:        make(map[string]*sync.Mutex),
		workerAddr:      workerAddr,
	}

	// Re-sync from Redis on startup
	ctx := context.Background()
	existing, err := redis.AllSessions(ctx)
	if err != nil {
		return nil, fmt.Errorf("session manager: redis sync failed: %w", err)
	}

	for _, s := range existing {
		m.sessions[s.SessionID] = s
		m.log.Info("Re-adopted session from Redis", "sessionId", s.SessionID, "runtimeId", truncateID(s.RuntimeID, 12), "provider", s.Provider)
	}
	metrics.ActiveContainers.Set(float64(len(m.sessions)))

	return m, nil
}

// GetProvider resolves the SandboxProvider for a specific session by looking up its recorded Provider.
// Defaults to the configured default provider ("docker") if unspecified or unavailable.
func (m *Manager) GetProvider(sessionID string) (sandbox.SandboxProvider, error) {
	m.mu.RLock()
	s, ok := m.sessions[sessionID]
	m.mu.RUnlock()

	var providerName string
	if ok {
		providerName = s.Provider
	} else if m.redis != nil {
		data, err := m.redis.Get(context.Background(), sessionID)
		if err == nil && data != nil {
			providerName = data.Provider
		}
	}

	return m.GetProviderByName(providerName), nil
}

// GetProviderByName resolves a SandboxProvider by name, falling back to defaultProvider.
func (m *Manager) GetProviderByName(name string) sandbox.SandboxProvider {
	normalized := strings.ToLower(strings.TrimSpace(name))
	if p, ok := m.providers[normalized]; ok && p != nil {
		return p
	}
	if p, ok := m.providers[m.defaultProvider]; ok && p != nil {
		return p
	}
	if p, ok := m.providers["docker"]; ok && p != nil {
		return p
	}
	// Return any provider available in the map
	for _, p := range m.providers {
		if p != nil {
			return p
		}
	}
	return nil
}

// AllProviders returns all distinct configured providers.
func (m *Manager) AllProviders() []sandbox.SandboxProvider {
	m.mu.RLock()
	defer m.mu.RUnlock()
	unique := make(map[sandbox.SandboxProvider]struct{})
	for _, p := range m.providers {
		if p != nil {
			unique[p] = struct{}{}
		}
	}
	res := make([]sandbox.SandboxProvider, 0, len(unique))
	for p := range unique {
		res = append(res, p)
	}
	return res
}

// TTL returns the configured session TTL.
func (m *Manager) TTL() time.Duration {
	return m.ttl
}

// StartDiskMonitor runs a background loop to scan and enforce disk quotas across all active providers.
func (m *Manager) StartDiskMonitor(ctx context.Context) {
	ticker := time.NewTicker(10 * time.Second)
	go func() {
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				// Collect unique providers
				unique := make(map[sandbox.SandboxProvider]bool)
				for _, p := range m.providers {
					if p != nil {
						unique[p] = true
					}
				}
				for p := range unique {
					// 1 GB limit
					killed, err := p.EnforceDiskQuotas(ctx, 1024*1024*1024)
					if err != nil {
						m.log.Error("Failed to enforce disk quotas", "error", err)
					} else if len(killed) > 0 {
						metrics.DiskQuotaKillsTotal.Add(float64(len(killed)))
						m.log.Warn("Enforced disk quota on containers", "count", len(killed), "containers", killed)
					}
				}
			}
		}
	}()
}

// Create provisions a new container and registers the session in Redis + memory.
// It dynamically selects the SandboxProvider matching requestedProvider (or defaults to "docker").
func (m *Manager) Create(ctx context.Context, sessionID, userID, challengeID, image, requestedProvider string) (*store.SessionData, error) {
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

	normProvider := strings.ToLower(strings.TrimSpace(requestedProvider))
	if normProvider == "" {
		normProvider = m.defaultProvider
	}
	provider := m.GetProviderByName(normProvider)
	if provider == nil {
		return nil, fmt.Errorf("session create: no sandbox provider available for %q", requestedProvider)
	}

	m.log.Info("Provisioning sandbox for session",
		"sessionId", sessionID,
		"image", image,
		"userId", userID,
		"provider", normProvider,
	)

	// Save initial state to Redis so sandbox-router can route WebSocket
	// connections to this worker to stream live progress events.
	initialData := store.SessionData{
		SessionID:   sessionID,
		RuntimeID: "provisioning",
		UserID:      userID,
		ChallengeID: challengeID,
		Image:       image,
		Provider:    normProvider,
		CreatedAt:   time.Now().UTC(),
		WorkerAddr:  m.workerAddr,
	}
	_ = m.redis.Save(ctx, initialData)

	if m.IsolationDowngraded && normProvider == "docker" {
		m.log.Warn("Downgraded isolation level enforced for session", "sessionId", sessionID, "provider", "docker")
		m.Progress.Publish(sessionID, StageIsolationDowngraded, "Running with standard isolation — enhanced sandboxing unavailable on this host")
	}

	m.Progress.Publish(sessionID, StageImagePullStart, "Pulling container image "+image)

	startProvision := time.Now()
	containerID, err := provider.Provision(ctx, image)
	if err != nil {
		m.Progress.Publish(sessionID, StageFailed, "Failed to provision sandbox container: "+err.Error())
		if m.redis != nil {
			_ = m.redis.Delete(ctx, sessionID)
		}
		return nil, fmt.Errorf("session create: provision failed: %w", err)
	}
	metrics.ProvisionDuration.WithLabelValues(normProvider, image).Observe(time.Since(startProvision).Seconds())

	m.Progress.Publish(sessionID, StageImagePullComplete, "Container image ready")
	m.Progress.Publish(sessionID, StageContainerCreated, "Created sandbox layer")
	m.Progress.Publish(sessionID, StageContainerStarted, "Sandbox container started")

	data := store.SessionData{
		SessionID:   sessionID,
		RuntimeID: containerID,
		UserID:      userID,
		ChallengeID: challengeID,
		Image:       image,
		Provider:    normProvider,
		CreatedAt:   time.Now().UTC(),
		WorkerAddr:  m.workerAddr,
	}

	if err := m.redis.Save(ctx, data); err != nil {
		// Best-effort: container is running, but we couldn't save to Redis.
		// Clean up the container to avoid an orphan.
		_ = provider.Remove(ctx, containerID)
		return nil, fmt.Errorf("session create: redis save failed: %w", err)
	}

	m.mu.Lock()
	m.sessions[sessionID] = data
	delete(m.inFlight, sessionID) // clean up the in-flight mutex
	activeCount := float64(len(m.sessions))
	m.mu.Unlock()
	metrics.ActiveContainers.Set(activeCount)
	
	m.log.Info("✅ Session created", "sessionId", sessionID, "containerID", truncateID(containerID, 12), "provider", normProvider)
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

	m.log.Info("Destroying session", "sessionId", sessionID, "runtimeId", truncateID(data.RuntimeID, 12), "provider", data.Provider)

	// Dynamically resolve the provider used for this session
	provider, _ := m.GetProvider(sessionID)
	if provider == nil {
		provider = m.GetProviderByName(data.Provider)
	}

	// Remove container (best-effort — don't fail if already gone)
	if provider != nil {
		if err := provider.Remove(ctx, data.RuntimeID); err != nil {
			m.log.Warn("Container remove failed during destroy", "error", err)
		}
	}

	// Clean up Redis
	if m.redis != nil {
		if err := m.redis.Delete(ctx, sessionID); err != nil {
			m.log.Warn("Redis delete failed during destroy", "error", err)
		}
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
