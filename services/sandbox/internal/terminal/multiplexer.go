package terminal

import (
	"context"
	"io"
	"log/slog"
	"sync"

	"github.com/devops-platform/sandbox/internal/sandbox"
)

// Subscriber represents a single WebSocket connection listening to a session.
type Subscriber struct {
	ID   string
	Chan chan []byte
}

// SharedPTY wraps a single Docker Exec/tmux attach process and fans out output to subscribers.
type SharedPTY struct {
	SessionID   string
	ContainerID string
	Provider    sandbox.SandboxProvider
	Log         *slog.Logger

	pty      io.ReadWriteCloser
	resizeFn sandbox.ResizeFunc
	cancel   context.CancelFunc

	writeMu sync.Mutex

	subMu       sync.RWMutex
	subscribers map[string]*Subscriber
}

// Multiplexer is the global registry of SharedPTYs.
type Multiplexer struct {
	mu       sync.Mutex
	sessions map[string]*SharedPTY

	provider sandbox.SandboxProvider
	log      *slog.Logger
}

func NewMultiplexer(provider sandbox.SandboxProvider, log *slog.Logger) *Multiplexer {
	return &Multiplexer{
		sessions: make(map[string]*SharedPTY),
		provider: provider,
		log:      log,
	}
}

// GetOrStart returns an existing SharedPTY for the session, or starts a new one.
func (m *Multiplexer) GetOrStart(ctx context.Context, sessionID, containerID string, cols, rows uint, initialSubID string) (*SharedPTY, *Subscriber, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if pty, ok := m.sessions[sessionID]; ok {
		// Existing PTY - resize it to the latest requested dimensions
		if pty.resizeFn != nil {
			_ = pty.resizeFn(cols, rows)
		}
		
		// Subscribe the new client atomically while we have the lock
		sub := pty.Subscribe(initialSubID)
		return pty, sub, nil
	}

	// Create new
	ptyCtx, cancel := context.WithCancel(context.Background())
	
	ptyStream, resizeFn, err := StartOrAttach(ptyCtx, m.provider, containerID, sessionID, cols, rows, m.log)
	if err != nil {
		cancel()
		return nil, nil, err
	}

	shared := &SharedPTY{
		SessionID:   sessionID,
		ContainerID: containerID,
		Provider:    m.provider,
		Log:         m.log,
		pty:         ptyStream,
		resizeFn:    resizeFn,
		cancel:      cancel,
		subscribers: make(map[string]*Subscriber),
	}

	// Add the first subscriber before starting the read loop
	sub := shared.Subscribe(initialSubID)

	m.sessions[sessionID] = shared

	// Start read loop
	go shared.readLoop()

	// Handle cleanup when PTY dies
	go func() {
		<-ptyCtx.Done()
		m.mu.Lock()
		if m.sessions[sessionID] == shared {
			delete(m.sessions, sessionID)
		}
		m.mu.Unlock()
	}()

	return shared, sub, nil
}

func (s *SharedPTY) readLoop() {
	defer s.cancel() // If read loop dies, cancel context
	defer s.pty.Close()

	buf := make([]byte, 4096)
	for {
		n, err := s.pty.Read(buf)
		if err != nil {
			if err != io.EOF {
				s.Log.Error("SharedPTY read error", "sessionID", s.SessionID, "error", err)
			}
			break
		}

		if n > 0 {
			chunk := make([]byte, n)
			copy(chunk, buf[:n])
			s.broadcast(chunk)
		}
	}
	s.Log.Info("SharedPTY read loop exited, closing subscribers", "sessionID", s.SessionID)
	s.closeSubscribers()
}

func (s *SharedPTY) broadcast(data []byte) {
	s.subMu.RLock()
	defer s.subMu.RUnlock()

	for _, sub := range s.subscribers {
		select {
		case sub.Chan <- data:
			// Success
		default:
			// Buffer full - drop data or disconnect subscriber
			// Since we want to protect the PTY, we'll just drop the chunk for now,
			s.Log.Warn("Subscriber buffer full, dropping output", "sessionID", s.SessionID, "subID", sub.ID)
		}
	}
}

// Subscribe registers a new subscriber and returns a channel of output bytes.
func (s *SharedPTY) Subscribe(subID string) *Subscriber {
	s.subMu.Lock()
	defer s.subMu.Unlock()

	sub := &Subscriber{
		ID:   subID,
		Chan: make(chan []byte, 1024), // Large buffer to prevent drops
	}
	s.subscribers[subID] = sub
	s.Log.Info("New subscriber attached", "sessionID", s.SessionID, "subID", subID, "total", len(s.subscribers))
	return sub
}

// Unsubscribe removes a subscriber.
func (s *SharedPTY) Unsubscribe(subID string) {
	s.subMu.Lock()
	defer s.subMu.Unlock()

	if sub, ok := s.subscribers[subID]; ok {
		delete(s.subscribers, subID)
		close(sub.Chan)
		s.Log.Info("Subscriber detached", "sessionID", s.SessionID, "subID", subID, "total", len(s.subscribers))
	}
}

func (s *SharedPTY) closeSubscribers() {
	s.subMu.Lock()
	defer s.subMu.Unlock()
	for id, sub := range s.subscribers {
		close(sub.Chan)
		delete(s.subscribers, id)
	}
}

// Write safely writes input bytes to the shared PTY.
func (s *SharedPTY) Write(data []byte) error {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()

	_, err := s.pty.Write(data)
	return err
}

// Resize resizes the PTY.
func (s *SharedPTY) Resize(cols, rows uint) error {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	if s.resizeFn != nil {
		return s.resizeFn(cols, rows)
	}
	return nil
}
