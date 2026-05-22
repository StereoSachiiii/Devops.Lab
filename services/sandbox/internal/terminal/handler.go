package terminal

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

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

// Claims represents the parsed claims from the Fastify-issued JWT.
type Claims struct {
	Subject   string `json:"sub"`
	Email     string `json:"email"`
	Role      string `json:"role"`
	Issuer    string `json:"iss"`
	ExpiresAt int64  `json:"exp"`
}

// VerifyJWT parses and verifies HS256 signature and checks standard claims.
func VerifyJWT(tokenString string, secret string) (*Claims, error) {
	parts := strings.Split(tokenString, ".")
	if len(parts) != 3 {
		return nil, errors.New("invalid token format")
	}

	// 1. Verify signature
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(parts[0] + "." + parts[1]))
	expectedSignature := mac.Sum(nil)

	signature, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return nil, errors.New("failed to decode signature")
	}

	if subtle.ConstantTimeCompare(signature, expectedSignature) != 1 {
		return nil, errors.New("invalid signature")
	}

	// 2. Decode payload
	payloadBytes, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, errors.New("failed to decode payload")
	}

	var claims Claims
	if err := json.Unmarshal(payloadBytes, &claims); err != nil {
		return nil, errors.New("failed to unmarshal claims")
	}

	// 3. Verify expiration
	if claims.ExpiresAt > 0 && time.Now().Unix() > claims.ExpiresAt {
		return nil, errors.New("token is expired")
	}

	// 4. Verify issuer
	if claims.Issuer != "devops-platform" {
		return nil, errors.New("invalid issuer")
	}

	return &claims, nil
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
		claims, err := validateJWT(r, jwtSecret)
		if err != nil {
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

		// ── Ownership check ───────────────────────────────────────────────────
		// Ensure the user connecting is the one who started the session.
		if claims.Subject != sessionData.UserID {
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

// validateJWT extracts and validates the Bearer token from the Authorization header or query param.
// Returns the claims if successful, or an error if invalid.
func validateJWT(r *http.Request, secret string) (*Claims, error) {
	auth := r.Header.Get("Authorization")
	if auth == "" {
		// Also check query param for browser clients that can't set headers
		auth = r.URL.Query().Get("token")
	}
	if auth == "" {
		return nil, fmt.Errorf("no authorization token")
	}

	token := strings.TrimPrefix(auth, "Bearer ")
	if token == "" {
		return nil, fmt.Errorf("empty token")
	}

	if secret == "" {
		return nil, fmt.Errorf("JWT validation not configured")
	}

	return VerifyJWT(token, secret)
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

