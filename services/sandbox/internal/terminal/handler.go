package terminal

import (
	"context"
	"crypto/rsa"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/websocket"

	"github.com/devops-platform/sandbox/internal/sandbox"
	"github.com/devops-platform/sandbox/internal/session"
)

// Claims represents the parsed claims from the Fastify-issued JWT.
type Claims struct {
	Subject string `json:"sub"`
	Email   string `json:"email"`
	Role    string `json:"role"`
	JTI     string `json:"jti,omitempty"`
	jwt.RegisteredClaims
}

// VerifyJWT parses and verifies an RS256 signature and checks standard claims.
func VerifyJWT(tokenString string, pubKey *rsa.PublicKey) (*Claims, error) {
	var claims Claims
	token, err := jwt.ParseWithClaims(tokenString, &claims, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodRSA); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return pubKey, nil
	})

	if err != nil {
		return nil, fmt.Errorf("failed to parse/verify token: %w", err)
	}

	if !token.Valid {
		return nil, fmt.Errorf("token is invalid")
	}

	// Verify expiration
	if claims.ExpiresAt != nil && claims.ExpiresAt.Before(time.Now()) {
		return nil, fmt.Errorf("token is expired")
	}

	// Verify issuer
	iss, _ := claims.GetIssuer()
	if iss != "devops-platform" {
		return nil, fmt.Errorf("invalid issuer")
	}

	return &claims, nil
}

// Handler returns an HTTP handler for WebSocket terminal connections.
//
// Route: GET /sessions/{sessionID}/terminal?cols=220&rows=50
// Auth:  JWT in Authorization header (validated before upgrade)
//
// allowedOrigins is a comma-separated list of permitted WebSocket origins (e.g. "https://app.example.com").
func Handler(mgr *session.Manager, mux *Multiplexer, provider sandbox.SandboxProvider, pubKey *rsa.PublicKey, allowedOrigins string, log *slog.Logger) http.HandlerFunc {
	allowed := strings.Split(allowedOrigins, ",")
	upgrader := websocket.Upgrader{
		ReadBufferSize:  4096,
		WriteBufferSize: 4096,
		CheckOrigin: func(r *http.Request) bool {
			origin := r.Header.Get("Origin")
			if origin == "" {
				return true
			}
			for _, o := range allowed {
				trimmed := strings.TrimSpace(o)
				if trimmed == "*" || trimmed == origin {
					return true
				}
			}
			// Allow local dev origins
			if strings.HasPrefix(origin, "http://localhost") || strings.HasPrefix(origin, "http://127.0.0.1") {
				return true
			}
			return false
		},
	}
	return func(w http.ResponseWriter, r *http.Request) {
		// ── Route dispatch ────────────────────────────────────────────────────
		// /sessions/{sessionID}/terminal  → WebSocket terminal
		// /sessions/{sessionID}/health    → JSON health probe (no upgrade)
		path := r.URL.Path

		if strings.HasSuffix(path, "/health") {
			handleHealth(w, r, mgr, provider, pubKey, log)
			return
		}

		handleTerminal(w, r, mgr, mux, pubKey, allowedOrigins, upgrader, log)
	}
}

// handleHealth responds to GET /sessions/{sessionID}/health.
//
// Returns {"alive": true} if the session exists in Redis and the sandbox container
// is still reachable, {"alive": false} otherwise. This is the single endpoint the
// client polls during RECONNECTING state to distinguish Failure Mode A (WebSocket
// dropped, sandbox still alive) from Failure Mode B (sandbox actually dead).
func handleHealth(w http.ResponseWriter, r *http.Request, mgr *session.Manager, provider sandbox.SandboxProvider, pubKey *rsa.PublicKey, log *slog.Logger) {
	sessionID := extractSessionIDFromHealth(r.URL.Path)
	if sessionID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"alive": false, "error": "missing session ID"})
		return
	}

	// Auth — health endpoint requires the same JWT as the terminal WebSocket.
	// The client always has the token at this point (it's used for the WS connection).
	claims, err := validateJWT(r, pubKey)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]any{"alive": false})
		return
	}

	if claims.JTI != "" && mgr.IsTokenDenylisted(r.Context(), claims.JTI) {
		log.Warn("Denylisted token access attempt", "sessionId", sessionID, "jti", claims.JTI)
		writeJSON(w, http.StatusUnauthorized, map[string]any{"alive": false, "error": "token revoked"})
		return
	}

	ctx := r.Context()
	sessionData, err := mgr.Get(ctx, sessionID)
	if err != nil || sessionData == nil {
		writeJSON(w, http.StatusOK, map[string]any{"alive": false})
		return
	}

	// Ownership check
	if claims.Subject != sessionData.UserID {
		writeJSON(w, http.StatusForbidden, map[string]any{"alive": false})
		return
	}

	// Probe the container — a lightweight Exec that does nothing is the most
	// accurate liveness check we have without adding a separate ping mechanism.
	result, err := provider.Exec(ctx, sessionData.ContainerID, []string{"/bin/true"})
	alive := err == nil && result.ExitCode == 0

	log.Debug("Health probe", "sessionId", sessionID, "alive", alive)
	writeJSON(w, http.StatusOK, map[string]any{"alive": alive})
}

// handleTerminal upgrades to WebSocket and bridges to the tmux-wrapped PTY.
func handleTerminal(w http.ResponseWriter, r *http.Request, mgr *session.Manager, multiplexer *Multiplexer, pubKey *rsa.PublicKey, _ string, upgrader websocket.Upgrader, log *slog.Logger) {
	// ── Extract sessionID from URL path (/sessions/{sessionID}/terminal) ──
	sessionID := extractSessionID(r.URL.Path)
	if sessionID == "" {
		http.Error(w, "missing session ID", http.StatusBadRequest)
		return
	}

	// ── Validate JWT before upgrading to WebSocket ────────────────────────
	claims, err := validateJWT(r, pubKey)
	if err != nil {
		log.Warn("WebSocket auth failed", "sessionId", sessionID, "error", err)
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	if claims.JTI != "" && mgr.IsTokenDenylisted(r.Context(), claims.JTI) {
		log.Warn("WebSocket auth failed: token denylisted", "sessionId", sessionID, "jti", claims.JTI)
		http.Error(w, "unauthorized: token revoked", http.StatusUnauthorized)
		return
	}

	// ── Look up the session (Redis/memory) ────────────────────────────────
	ctx := r.Context()
	sessionData, err := mgr.Get(ctx, sessionID)

	hist := mgr.Progress.GetHistory(sessionID)
	if sessionData == nil && len(hist) == 0 && err == nil {
		http.Error(w, "session not found", http.StatusNotFound)
		return
	}

	if sessionData != nil && claims.Subject != sessionData.UserID {
		log.Warn("Forbidden session access attempt",
			"sessionId", sessionID,
			"ownerId", sessionData.UserID,
			"requestedBy", claims.Subject,
		)
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	// ── Parse terminal dimensions from query params ───────────────────────
	cols := parseUint(r.URL.Query().Get("cols"), 220)
	rows := parseUint(r.URL.Query().Get("rows"), 50)

	// ── Upgrade HTTP → WebSocket ──────────────────────────────────────────
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Error("WebSocket upgrade failed", "error", err)
		return
	}
	defer ws.Close()

	// Flush historical progress events
	sentStages := make(map[session.ProgressStage]bool)
	for _, evt := range hist {
		if evt.Stage == session.StageReady {
			// Skip READY here so we can guarantee we only send it AFTER we're subscribed to the PTY
			continue
		}
		_ = ws.WriteJSON(evt)
		sentStages[evt.Stage] = true
	}

	// If session is still provisioning, wait for it to complete while streaming live events
	// (sessionData might be nil if not in Redis yet, or ContainerID == "provisioning" if it is)
	if sessionData == nil || sessionData.ContainerID == "provisioning" {
		histEvents, liveChan, unsub := mgr.Progress.Subscribe(sessionID)
		defer unsub()

		for _, evt := range histEvents {
			if !sentStages[evt.Stage] && evt.Stage != session.StageReady {
				_ = ws.WriteJSON(evt)
				sentStages[evt.Stage] = true
			}
		}

		timeout := time.After(30 * time.Second)
		ticker := time.NewTicker(100 * time.Millisecond)
		defer ticker.Stop()

	WaitLoop:
		for {
			select {
			case evt, ok := <-liveChan:
				if ok && !sentStages[evt.Stage] && evt.Stage != session.StageReady {
					_ = ws.WriteJSON(evt)
					sentStages[evt.Stage] = true
				}
			case <-ticker.C:
				sessionData, err = mgr.Get(ctx, sessionID)
				if sessionData != nil && sessionData.ContainerID != "provisioning" {
					break WaitLoop
				}
			case <-timeout:
				log.Error("Provisioning wait timed out", "sessionId", sessionID)
				_ = ws.WriteJSON(map[string]any{"type": "error", "message": "Provisioning timed out"})
				return
			}
		}
	}

	// Verify ownership if sessionData was acquired during wait
	if claims.Subject != sessionData.UserID {
		log.Warn("Forbidden session access attempt", "sessionId", sessionID, "ownerId", sessionData.UserID, "requestedBy", claims.Subject)
		_ = ws.WriteJSON(map[string]any{"type": "error", "message": "forbidden"})
		return
	}

	// Emit TMUX_ATTACHED progress event
	if !sentStages[session.StageTmuxAttached] {
		evt := mgr.Progress.Publish(sessionID, session.StageTmuxAttached, "Starting shell session (tmux)")
		_ = ws.WriteJSON(evt)
		sentStages[session.StageTmuxAttached] = true
	}

	// ── Open or Attach to Shared PTY ────────────────────────────
	subID := r.RemoteAddr
	pty, subscriber, err := multiplexer.GetOrStart(ctx, sessionID, sessionData.ContainerID, cols, rows, subID)
	if err != nil {
		log.Error("Failed to open PTY via multiplexer", "sessionId", sessionID, "error", err)
		_ = ws.WriteJSON(map[string]any{"type": "error", "message": "could not open terminal"})
		return
	}
	defer pty.Unsubscribe(subID)

	// Emit READY progress event AFTER subscribing, to avoid race conditions
	// where the client receives READY and sends a command before being added to subscribers.
	// Since we skipped it in the history flush, we know it hasn't been sent to this connection yet.
	evt := mgr.Progress.Publish(sessionID, session.StageReady, "Sandbox ready")
	_ = ws.WriteJSON(evt)
	sentStages[session.StageReady] = true

	log.Info("🖥️  Terminal connected",
		"sessionId", sessionID,
		"containerID", sessionData.ContainerID[:12],
		"cols", cols,
		"rows", rows,
		"subID", subID,
	)

	wsMu := &sync.Mutex{}

	// ── Pre-Expiration TTL Warning ──────────────────────────────────────────
	warningCtx, cancelWarning := context.WithCancel(context.Background())
	defer cancelWarning()

	warningDuration := 5 * time.Minute
	if mgr.TTL() <= warningDuration {
		warningDuration = mgr.TTL() / 2
	}
	expiresAt := sessionData.CreatedAt.Add(mgr.TTL())
	timeUntilWarning := time.Until(expiresAt.Add(-warningDuration))

	if timeUntilWarning > 0 {
		go func() {
			select {
			case <-warningCtx.Done():
				return
			case <-time.After(timeUntilWarning):
				wsMu.Lock()
				_ = ws.SetWriteDeadline(time.Now().Add(10 * time.Second))
				_ = ws.WriteJSON(map[string]any{
					"type":             "ttl_warning",
					"minutesRemaining": warningDuration.Minutes(),
				})
				_ = ws.SetWriteDeadline(time.Time{})
				wsMu.Unlock()
			}
		}()
	}

	// ── Bridge WebSocket ↔ Multiplexer ─────────────────────────
	
	// Write loop (Multiplexer -> WebSocket)
	var wg sync.WaitGroup
	wg.Add(2)

	go func() {
		defer wg.Done()
		for chunk := range subscriber.Chan {
			wsMu.Lock()
			_ = ws.SetWriteDeadline(time.Now().Add(10 * time.Second))
			err := ws.WriteMessage(websocket.BinaryMessage, chunk)
			_ = ws.SetWriteDeadline(time.Time{})
			wsMu.Unlock()
			if err != nil {
				break
			}
		}
	}()

	// Read loop (WebSocket -> Multiplexer)
	go func() {
		defer wg.Done()
		for {
			msgType, data, err := ws.ReadMessage()
			if err != nil {
				break
			}

			if msgType == websocket.TextMessage {
				// Handle control messages (resize, ping)
				var msg map[string]any
				if err := json.Unmarshal(data, &msg); err == nil {
					switch msg["type"] {
					case "resize":
						if c, ok := msg["cols"].(float64); ok {
							if r, ok := msg["rows"].(float64); ok {
								_ = pty.Resize(uint(c), uint(r))
							}
						}
					case "ping":
						wsMu.Lock()
						_ = ws.SetWriteDeadline(time.Now().Add(10 * time.Second))
						_ = ws.WriteJSON(map[string]any{"type": "pong"})
						_ = ws.SetWriteDeadline(time.Time{})
						wsMu.Unlock()
					}
				}
			} else if msgType == websocket.BinaryMessage {
				// Write directly to the shared PTY
				_ = pty.Write(data)
			}
		}
		
		// If the websocket read fails, we want to close the subscription
		// and cancel the write loop so we don't leak.
		pty.Unsubscribe(subID)
	}()

	wg.Wait()
	log.Info("Terminal disconnected", "sessionId", sessionID, "subID", subID)
}

func validateJWT(r *http.Request, pubKey *rsa.PublicKey) (*Claims, error) {
	auth := r.Header.Get("Authorization")
	if auth == "" {
		// Also check query param for browser clients that can't set headers
		auth = r.URL.Query().Get("token")
	}
	if auth == "" {
		// Also check Sec-WebSocket-Protocol for WebSocket clients
		wsProto := r.Header.Get("Sec-WebSocket-Protocol")
		if wsProto != "" {
			parts := strings.Split(wsProto, ",")
			for _, p := range parts {
				trimmed := strings.TrimSpace(p)
				if strings.HasPrefix(trimmed, "bearer.") || strings.HasPrefix(trimmed, "bearer_") {
					auth = "Bearer " + strings.TrimPrefix(strings.TrimPrefix(trimmed, "bearer."), "bearer_")
					break
				}
			}
		}
	}
	
	token := ""
	if auth != "" {
		token = strings.TrimPrefix(auth, "Bearer ")
	} else {
		// Check cookies for httpOnly token
		if cookie, err := r.Cookie("token"); err == nil {
			token = cookie.Value
		}
	}
	token = strings.Trim(strings.TrimSpace(token), "\"")

	if token == "" {
		return nil, fmt.Errorf("no authorization token")
	}

	if pubKey == nil {
		return nil, fmt.Errorf("JWT validation not configured (missing public key)")
	}

	return VerifyJWT(token, pubKey)
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

// extractSessionIDFromHealth parses the sessionID from paths like /sessions/{id}/health.
func extractSessionIDFromHealth(path string) string {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) >= 3 && parts[0] == "sessions" && parts[2] == "health" {
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

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	b, _ := json.Marshal(v)
	_, _ = w.Write(b)
}
