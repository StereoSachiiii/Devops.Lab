package terminal

import (
	"context"
	"crypto/rsa"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

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

	// 4. Verify issuer
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
func Handler(mgr *session.Manager, provider sandbox.SandboxProvider, pubKey *rsa.PublicKey, allowedOrigins string, log *slog.Logger) http.HandlerFunc {
	allowed := strings.Split(allowedOrigins, ",")
	upgrader := websocket.Upgrader{
		ReadBufferSize:  4096,
		WriteBufferSize: 4096,
		CheckOrigin: func(r *http.Request) bool {
			origin := r.Header.Get("Origin")
			for _, o := range allowed {
				if strings.TrimSpace(o) == origin {
					return true
				}
			}
			return false
		},
	}
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
		claims, err := validateJWT(r, pubKey)
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
		pty, resizeFn, err := provider.ExecInteractive(ctx, sessionData.ContainerID, cols, rows)
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
func validateJWT(r *http.Request, pubKey *rsa.PublicKey) (*Claims, error) {
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

func parseUint(s string, fallback uint) uint {
	if n, err := strconv.ParseUint(s, 10, 32); err == nil {
		return uint(n)
	}
	return fallback
}

