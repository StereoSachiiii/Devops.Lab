package session

import (
	"context"
	"log/slog"
	"time"
)

// Reaper runs a background loop that destroys sessions that have exceeded their TTL.
// This is a safety net — the primary expiry is the Redis TTL. The reaper also
// cleans up Docker containers, which Redis can't do.
type Reaper struct {
	manager  *Manager
	ttl      time.Duration
	interval time.Duration
	log      *slog.Logger
}

// NewReaper creates a Reaper. interval is how often it checks for expired sessions.
func NewReaper(manager *Manager, ttl time.Duration, log *slog.Logger) *Reaper {
	return &Reaper{
		manager:  manager,
		ttl:      ttl,
		interval: 1 * time.Minute, // check every minute
		log:      log,
	}
}

// Start runs the reaper loop until ctx is cancelled (i.e. on SIGTERM).
func (r *Reaper) Start(ctx context.Context) {
	r.log.Info("🧹 Session reaper started", "ttl", r.ttl, "interval", r.interval)
	ticker := time.NewTicker(r.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			r.log.Info("Session reaper shutting down")
			return
		case <-ticker.C:
			r.Sweep(ctx)
		}
	}
}

// Sweep checks all active sessions and destroys any that have exceeded TTL.
func (r *Reaper) Sweep(ctx context.Context) {
	sessions := r.manager.AllActive()
	if len(sessions) == 0 {
		return
	}

	now := time.Now().UTC()
	reaped := 0

	for _, s := range sessions {
		age := now.Sub(s.CreatedAt)
		if age > r.ttl {
			r.log.Info("Reaping expired session",
				"sessionId", s.SessionID,
				"age", age,
			)
			if err := r.manager.Destroy(ctx, s.SessionID); err != nil {
				r.log.Error("Failed to reap session", "sessionId", s.SessionID, "error", err)
			} else {
				reaped++
			}
			continue
		}

		// Proactive death detection: check if container is still running
		isRunning, err := r.manager.provider.IsRunning(ctx, s.ContainerID)
		if err != nil {
			r.log.Error("Failed to check container status", "sessionId", s.SessionID, "error", err)
			continue
		}

		if !isRunning {
			r.log.Info("Reaping dead session (container stopped prematurely)",
				"sessionId", s.SessionID,
				"containerId", s.ContainerID,
			)
			if err := r.manager.Destroy(ctx, s.SessionID); err != nil {
				r.log.Error("Failed to reap dead session", "sessionId", s.SessionID, "error", err)
			} else {
				reaped++
			}
		}
	}

	if reaped > 0 {
		r.log.Info("Reaper sweep complete", "reaped", reaped, "active", len(sessions)-reaped)
	}
}
