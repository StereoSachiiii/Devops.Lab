package session

import (
	"testing"
	"time"
)

func TestProgressTracker_PublishAndSubscribe(t *testing.T) {
	pt := NewProgressTracker()
	sessionID := "test-session-123"

	// 1. Publish initial event before subscription
	pt.Publish(sessionID, StageImagePullStart, "Pulling image...")

	// 2. Subscribe
	hist, ch, unsub := pt.Subscribe(sessionID)
	defer unsub()

	if len(hist) != 1 {
		t.Fatalf("expected 1 historical event, got %d", len(hist))
	}
	if hist[0].Stage != StageImagePullStart {
		t.Errorf("expected stage %s, got %s", StageImagePullStart, hist[0].Stage)
	}

	// 3. Publish event after subscription
	go func() {
		pt.Publish(sessionID, StageContainerCreated, "Created sandbox layer")
	}()

	select {
	case evt := <-ch:
		if evt.Stage != StageContainerCreated {
			t.Errorf("expected stage %s, got %s", StageContainerCreated, evt.Stage)
		}
	case <-time.After(1 * time.Second):
		t.Fatal("timed out waiting for live progress event")
	}
}

func TestProgressTracker_Clear(t *testing.T) {
	pt := NewProgressTracker()
	sessionID := "test-session-clear"

	pt.Publish(sessionID, StageReady, "Sandbox ready")
	pt.Clear(sessionID)

	hist := pt.GetHistory(sessionID)
	if len(hist) != 0 {
		t.Errorf("expected 0 events after clear, got %d", len(hist))
	}
}
