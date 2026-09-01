package session

import (
	"sync"
	"time"

	"github.com/devops-platform/sandbox/internal/store"
)

// NewTestManager returns an in-memory session.Manager for unit tests.
func NewTestManager() *Manager {
	return &Manager{
		ttl:      60 * time.Minute,
		Progress: NewProgressTracker(),
		sessions: make(map[string]store.SessionData),
		inFlight: make(map[string]*sync.Mutex),
	}
}

// AddTestSession pre-populates a session into the test manager.
func (m *Manager) AddTestSession(s store.SessionData) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.sessions[s.SessionID] = s
}
