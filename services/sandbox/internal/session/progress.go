package session

import (
	"sync"
	"time"
)

type ProgressStage string

const (
	StageImagePullStart      ProgressStage = "IMAGE_PULL_START"
	StageImagePullComplete   ProgressStage = "IMAGE_PULL_COMPLETE"
	StageContainerCreated    ProgressStage = "CONTAINER_CREATED"
	StageContainerStarted    ProgressStage = "CONTAINER_STARTED"
	StageTmuxAttached        ProgressStage = "TMUX_ATTACHED"
	StageReady               ProgressStage = "READY"
	StageIsolationDowngraded ProgressStage = "ISOLATION_DOWNGRADED"
)

// ProgressEvent is the JSON message format emitted over the WebSocket control channel.
type ProgressEvent struct {
	Type      string        `json:"type"` // always "progress"
	SessionID string        `json:"sessionId"`
	Stage     ProgressStage `json:"stage"`
	Message   string        `json:"message"`
	Timestamp int64         `json:"timestamp"`
}

// ProgressTracker maintains real-time provisioning progress events per session.
type ProgressTracker struct {
	mu          sync.RWMutex
	history     map[string][]ProgressEvent
	subscribers map[string][]chan ProgressEvent
}

func NewProgressTracker() *ProgressTracker {
	return &ProgressTracker{
		history:     make(map[string][]ProgressEvent),
		subscribers: make(map[string][]chan ProgressEvent),
	}
}

// Publish stores the event in history and broadcasts it to all active subscribers for the session.
func (pt *ProgressTracker) Publish(sessionID string, stage ProgressStage, message string) ProgressEvent {
	event := ProgressEvent{
		Type:      "progress",
		SessionID: sessionID,
		Stage:     stage,
		Message:   message,
		Timestamp: time.Now().UnixMilli(),
	}

	pt.mu.Lock()
	pt.history[sessionID] = append(pt.history[sessionID], event)
	subs := append([]chan ProgressEvent(nil), pt.subscribers[sessionID]...)
	pt.mu.Unlock()

	for _, ch := range subs {
		select {
		case ch <- event:
		default:
		}
	}
	return event
}

// Subscribe returns historical events and a live channel for new events.
// Call the returned cleanup function when done.
func (pt *ProgressTracker) Subscribe(sessionID string) ([]ProgressEvent, <-chan ProgressEvent, func()) {
	pt.mu.Lock()
	defer pt.mu.Unlock()

	hist := append([]ProgressEvent(nil), pt.history[sessionID]...)
	ch := make(chan ProgressEvent, 50)

	pt.subscribers[sessionID] = append(pt.subscribers[sessionID], ch)

	unsubscribe := func() {
		pt.mu.Lock()
		defer pt.mu.Unlock()

		subs := pt.subscribers[sessionID]
		for i, s := range subs {
			if s == ch {
				pt.subscribers[sessionID] = append(subs[:i], subs[i+1:]...)
				break
			}
		}
		close(ch)
	}

	return hist, ch, unsubscribe
}

// GetHistory returns all recorded events for a session.
func (pt *ProgressTracker) GetHistory(sessionID string) []ProgressEvent {
	pt.mu.RLock()
	defer pt.mu.RUnlock()
	return append([]ProgressEvent(nil), pt.history[sessionID]...)
}

// Clear removes tracked events for a session.
func (pt *ProgressTracker) Clear(sessionID string) {
	pt.mu.Lock()
	defer pt.mu.Unlock()
	delete(pt.history, sessionID)
	delete(pt.subscribers, sessionID)
}
