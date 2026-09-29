package session

import (
	"log/slog"
	"sync"
	"time"

	"github.com/devops-platform/sandbox/internal/sandbox"
	"github.com/devops-platform/sandbox/internal/store"
)

// NewTestManager returns an in-memory session.Manager for unit tests.
func NewTestManager() *Manager {
	return &Manager{
		providers:       make(map[string]sandbox.SandboxProvider),
		defaultProvider: "docker",
		ttl:             60 * time.Minute,
		log:             slog.Default(),
		Progress:        NewProgressTracker(),
		sessions:        make(map[string]store.SessionData),
		inFlight:        make(map[string]*sync.Mutex),
	}
}

// SetTestProvider registers a mock/test provider for unit tests.
func (m *Manager) SetTestProvider(name string, p sandbox.SandboxProvider) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.providers == nil {
		m.providers = make(map[string]sandbox.SandboxProvider)
	}
	m.providers[name] = p
}

// AddTestSession pre-populates a session into the test manager.
func (m *Manager) AddTestSession(s store.SessionData) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.sessions[s.SessionID] = s
}
