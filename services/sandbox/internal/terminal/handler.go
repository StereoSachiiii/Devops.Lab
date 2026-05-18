package terminal

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/gorilla/websocket"

	"github.com/devops-platform/sandbox/internal/sandbox"
	"github.com/devops-platform/sandbox/internal/session"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
	// CheckOrigin validates the request origin to prevent CSRF.
	// In production, restrict to your frontend domain.
	CheckOrigin: func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		// Allow localhost in development; restrict to your domain in production
		return strings.HasPrefix(origin, "http://localhost") ||
			strings.HasPrefix(origin, "https://devops-platform.io")
	},
}

// Handler returns an HTTP handler for WebSocket terminal connections.
//
// Route: GET /sessions/{sessionID}/terminal?cols=220&rows=50
// Auth:  JWT in Authorization header (validated before upgrade)
//
// The handler:
//  1. Validates the JWT
//  2. Looks up the session (gets containerID from Redis/memory)
//  3. Opens a PTY inside the container (docker exec -it /bin/bash)
//  4. Upgrades the HTTP connection to WebSocket
//  5. Calls Pipe() to bridge the WebSocket ↔ PTY
func Handler(mgr *session.Manager, docker sandbox.SandboxProvider, jwtSecret string, log *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// ── Extract sessionID from URL path (/sessions/{sessionID}/terminal) ──
		sessionID := extractSessionID(r.URL.Path)
		if sessionID == "" {
			http.Error(w, "missing session ID", http.StatusBadRequest)
			return
		}

		// ── Validate JWT before upgrading to WebSocket ────────────────────────
		// Auth header: "Authorization: Bearer <token>"
		// This must happen BEFORE the upgrade — after upgrade we can't send HTTP errors.
		if err := validateJWT(r, jwtSecret); err != nil {
			log.Warn("WebSocket auth failed", "sessionId", sessionID, "error", err)
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		// ── Look up the session (Redis/memory) ────────────────────────────────
		ctx := r.Context()
		sessionData, err := mgr.Get(ctx, sessionID)
		if err != nil {
			log.Error("Session lookup failed", "sessionId", sessionID, "error", err)
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		if sessionData == nil {
			http.Error(w, "session not found", http.StatusNotFound)
			return
		}

		// ── Parse terminal dimensions from query params ───────────────────────
		cols := parseUint(r.URL.Query().Get("cols"), 220)
		rows := parseUint(r.URL.Query().Get("rows"), 50)

		// ── Open PTY inside the container ─────────────────────────────────────
		pty, resizeFn, err := docker.ExecInteractive(ctx, sessionData.ContainerID, cols, rows)
		if err != nil {
			log.Error("Failed to open PTY", "sessionId", sessionID, "error", err)
			http.Error(w, "could not open terminal", http.StatusInternalServerError)
			return
		}

		// ── Upgrade HTTP → WebSocket ──────────────────────────────────────────
		ws, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Error("WebSocket upgrade failed", "error", err)
			pty.Close()
			return
		}
		defer ws.Close()

		log.Info("🖥️  Terminal connected",
			"sessionId", sessionID,
			"containerID", sessionData.ContainerID[:12],
			"cols", cols,
			"rows", rows,
		)

		// ── Bridge WebSocket ↔ PTY — blocks until terminal closes ─────────────
		Pipe(context.Background(), ws, pty, resizeFn, log)

		log.Info("Terminal disconnected", "sessionId", sessionID)
	}
}

// validateJWT extracts and validates the Bearer token from the Authorization header.
// Returns an error if the token is missing or invalid.
func validateJWT(r *http.Request, secret string) error {
	auth := r.Header.Get("Authorization")
	if auth == "" {
		// Also check query param for browser clients that can't set headers
		auth = r.URL.Query().Get("token")
	}
	if auth == "" {
		return fmt.Errorf("no authorization token")
	}

	token := strings.TrimPrefix(auth, "Bearer ")
	if token == "" {
		return fmt.Errorf("empty token")
	}

	// TODO: replace with real JWT validation (e.g. golang-jwt/jwt)
	// For MVP, the auth-service signs tokens with the same JWT_SECRET.
	// This check is a placeholder — hook in real validation before prod.
	if secret == "" || token == "" {
		return fmt.Errorf("JWT validation not configured")
	}

	// Real validation would look like:
	// claims, err := jwt.ParseWithClaims(token, &Claims{}, func(t *jwt.Token) (any, error) {
	//     return []byte(secret), nil
	// })
	_ = secret
	_ = token
	return nil // placeholder — swap with real JWT lib
}

// extractSessionID parses the sessionID from paths like /sessions/{id}/terminal.
func extractSessionID(path string) string {
	// path: /sessions/abc123/terminal
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) >= 3 && parts[0] == "sessions" && parts[2] == "terminal" {
		return parts[1]
	}
	return ""
}

func parseUint(s string, fallback uint) uint {
	if n, err := strconv.ParseUint(s, 10, 32); err == nil {
		return uint(n)
	}
	return fallback
}
