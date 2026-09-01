package terminal

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/devops-platform/sandbox/internal/sandbox"
	"github.com/devops-platform/sandbox/internal/session"
	"github.com/devops-platform/sandbox/internal/store"
	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/websocket"
)

func generateKeyPair(t *testing.T) (*rsa.PrivateKey, *rsa.PublicKey) {
	t.Helper()
	priv, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("Failed to generate RSA key pair: %v", err)
	}
	return priv, &priv.PublicKey
}

func generateValidToken(t *testing.T, privKey *rsa.PrivateKey, sub string, exp time.Time) string {
	t.Helper()
	claims := Claims{
		Subject: sub,
		Email:   sub + "@example.com",
		Role:    "LEARNER",
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    "devops-platform",
			ExpiresAt: jwt.NewNumericDate(exp),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	tokenString, err := token.SignedString(privKey)
	if err != nil {
		t.Fatalf("Failed to sign token: %v", err)
	}
	return tokenString
}

func TestCheckOrigin_DirectLogic(t *testing.T) {
	allowedOrigins := "http://localhost:3000, http://localhost:5173, https://app.example.com"
	allowed := strings.Split(allowedOrigins, ",")

	upgrader := websocket.Upgrader{
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

	tests := []struct {
		name          string
		originHeader  string
		expectedAllow bool
	}{
		{
			name:          "Allowed origin - http://localhost:3000",
			originHeader:  "http://localhost:3000",
			expectedAllow: true,
		},
		{
			name:          "Allowed origin - http://localhost:5173 with spaces trimmed",
			originHeader:  "http://localhost:5173",
			expectedAllow: true,
		},
		{
			name:          "Allowed origin - https://app.example.com",
			originHeader:  "https://app.example.com",
			expectedAllow: true,
		},
		{
			name:          "Disallowed origin - http://evil.com",
			originHeader:  "http://evil.com",
			expectedAllow: false,
		},
		{
			name:          "Disallowed origin - http://localhost:8000",
			originHeader:  "http://localhost:8000",
			expectedAllow: false,
		},
		{
			name:          "Empty origin header",
			originHeader:  "",
			expectedAllow: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/sessions/test-123/terminal", nil)
			if tc.originHeader != "" {
				req.Header.Set("Origin", tc.originHeader)
			}

			allowed := upgrader.CheckOrigin(req)
			if allowed != tc.expectedAllow {
				t.Errorf("CheckOrigin(%q) = %v, expected %v", tc.originHeader, allowed, tc.expectedAllow)
			}
		})
	}
}

func TestHandler_AuthAndOriginFlow(t *testing.T) {
	allowedOrigins := "http://localhost:3000"
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	privKey, pubKey := generateKeyPair(t)

	// Create a dummy session manager struct with initialized fields
	dummyMgr := session.NewTestManager()
	mux := NewMultiplexer(nil, logger)

	handlerFunc := Handler(dummyMgr, mux, nil, pubKey, allowedOrigins, logger)

	t.Run("Missing auth token returns 401 Unauthorized regardless of Origin", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/sessions/sess-123/terminal", nil)
		req.Header.Set("Origin", "http://localhost:3000")

		rec := httptest.NewRecorder()
		handlerFunc.ServeHTTP(rec, req)

		if rec.Code != http.StatusUnauthorized {
			t.Errorf("Expected 401 Unauthorized for missing auth token, got %d", rec.Code)
		}
	})

	t.Run("Invalid auth token returns 401 Unauthorized", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/sessions/sess-123/terminal", nil)
		req.Header.Set("Origin", "http://localhost:3000")
		req.Header.Set("Authorization", "Bearer invalid-token")

		rec := httptest.NewRecorder()
		handlerFunc.ServeHTTP(rec, req)

		if rec.Code != http.StatusUnauthorized {
			t.Errorf("Expected 401 Unauthorized for invalid auth token, got %d", rec.Code)
		}
	})

	t.Run("Valid auth token but session not found returns 404", func(t *testing.T) {
		tokenStr := generateValidToken(t, privKey, "user-123", time.Now().Add(1*time.Hour))

		req := httptest.NewRequest("GET", "/sessions/sess-123/terminal", nil)
		req.Header.Set("Origin", "http://localhost:3000")
		req.Header.Set("Authorization", "Bearer "+tokenStr)

		rec := httptest.NewRecorder()
		handlerFunc.ServeHTTP(rec, req)

		if rec.Code != http.StatusNotFound {
			t.Errorf("Expected 404 Not Found for non-existent session, got %d", rec.Code)
		}
	})
}

func TestVerifyJWT(t *testing.T) {
	privKey, pubKey := generateKeyPair(t)
	altPrivKey, _ := generateKeyPair(t)

	t.Run("Valid token succeeds", func(t *testing.T) {
		tokenStr := generateValidToken(t, privKey, "user-123", time.Now().Add(1*time.Hour))
		claims, err := VerifyJWT(tokenStr, pubKey)
		if err != nil {
			t.Fatalf("Expected valid token to pass, got error: %v", err)
		}
		if claims.Subject != "user-123" {
			t.Errorf("Expected subject 'user-123', got %q", claims.Subject)
		}
	})

	t.Run("Token signed with wrong key fails", func(t *testing.T) {
		tokenStr := generateValidToken(t, altPrivKey, "user-123", time.Now().Add(1*time.Hour))
		_, err := VerifyJWT(tokenStr, pubKey)
		if err == nil {
			t.Fatalf("Expected error for token signed with wrong key, got nil")
		}
	})

	t.Run("Expired token fails", func(t *testing.T) {
		tokenStr := generateValidToken(t, privKey, "user-123", time.Now().Add(-1*time.Hour))
		_, err := VerifyJWT(tokenStr, pubKey)
		if err == nil {
			t.Fatalf("Expected error for expired token, got nil")
		}
	})

	t.Run("Token with invalid issuer fails", func(t *testing.T) {
		claims := Claims{
			Subject: "user-123",
			RegisteredClaims: jwt.RegisteredClaims{
				Issuer:    "invalid-issuer",
				ExpiresAt: jwt.NewNumericDate(time.Now().Add(1 * time.Hour)),
			},
		}
		token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
		tokenStr, _ := token.SignedString(privKey)

		_, err := VerifyJWT(tokenStr, pubKey)
		if err == nil {
			t.Fatalf("Expected error for token with invalid issuer, got nil")
		}
	})
}

func TestExtractSessionID(t *testing.T) {
	tests := []struct {
		path     string
		expected string
	}{
		{"/sessions/sess-abc-123/terminal", "sess-abc-123"},
		{"sessions/sess-xyz-999/terminal", "sess-xyz-999"},
		{"/sessions/sess-456/terminal/", "sess-456"},
		{"/sessions/sess-123", ""},
		{"/invalid/path", ""},
		{"", ""},
	}

	for _, tc := range tests {
		got := extractSessionID(tc.path)
		if got != tc.expected {
			t.Errorf("extractSessionID(%q) = %q; expected %q", tc.path, got, tc.expected)
		}
	}
}

func TestExtractSessionIDFromHealth(t *testing.T) {
	tests := []struct {
		path     string
		expected string
	}{
		{"/sessions/sess-abc-123/health", "sess-abc-123"},
		{"sessions/sess-xyz-999/health", "sess-xyz-999"},
		{"/sessions/sess-456/health/", "sess-456"},
		{"/sessions/sess-123/terminal", ""},
		{"/invalid/path", ""},
	}

	for _, tc := range tests {
		got := extractSessionIDFromHealth(tc.path)
		if got != tc.expected {
			t.Errorf("extractSessionIDFromHealth(%q) = %q; expected %q", tc.path, got, tc.expected)
		}
	}
}

func TestParseUint(t *testing.T) {
	if got := parseUint("220", 80); got != 220 {
		t.Errorf("Expected 220, got %d", got)
	}
	if got := parseUint("invalid", 80); got != 80 {
		t.Errorf("Expected fallback 80, got %d", got)
	}
	if got := parseUint("", 50); got != 50 {
		t.Errorf("Expected fallback 50, got %d", got)
	}
}

// MockProvider for testing PTY
type MockProvider struct {
	sandbox.SandboxProvider
	MockExecInteractive    func() (io.ReadWriteCloser, sandbox.ResizeFunc, error)
	MockExecInteractiveCmd func() (io.ReadWriteCloser, sandbox.ResizeFunc, error)
	MockExec               func() (sandbox.ExecResult, error)
	MockIsRunning          func(ctx context.Context, containerID string) (bool, error)
}

func (m *MockProvider) ExecInteractive(ctx context.Context, containerID string, cols, rows uint) (io.ReadWriteCloser, sandbox.ResizeFunc, error) {
	if m.MockExecInteractive != nil {
		return m.MockExecInteractive()
	}
	return nil, nil, nil
}

func (m *MockProvider) ExecInteractiveCmd(ctx context.Context, containerID string, cols, rows uint, cmd []string) (io.ReadWriteCloser, sandbox.ResizeFunc, error) {
	if m.MockExecInteractiveCmd != nil {
		return m.MockExecInteractiveCmd()
	}
	// Fallback to MockExecInteractive
	if m.MockExecInteractive != nil {
		return m.MockExecInteractive()
	}
	return nil, nil, nil
}

func (m *MockProvider) Exec(ctx context.Context, containerID string, cmd []string) (sandbox.ExecResult, error) {
	if m.MockExec != nil {
		return m.MockExec()
	}
	return sandbox.ExecResult{ExitCode: 0, Stdout: "", Stderr: ""}, nil
}

func (m *MockProvider) IsRunning(ctx context.Context, containerID string) (bool, error) {
	if m.MockIsRunning != nil {
		return m.MockIsRunning(ctx, containerID)
	}
	return true, nil
}

type MockPTY struct {
	io.Reader
	io.Writer
	io.Closer
}

func TestTTLWarningEmission(t *testing.T) {
	allowedOrigins := "http://localhost:3000"
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	privKey, pubKey := generateKeyPair(t)

	// Create test manager
	mgr := session.NewTestManager()
	
	// Create a session that expires in exactly 5 minutes and 200ms
	// meaning the 5-minute warning should fire in ~200ms.
	createdAt := time.Now().Add(-55*time.Minute + 200*time.Millisecond)
	sessionID := "sess-warning-test"
	userID := "user-123"
	
	mgr.AddTestSession(store.SessionData{
		SessionID:   sessionID,
		UserID:      userID,
		ContainerID: "container-id-1234567890",
		CreatedAt:   createdAt,
	})

	// Mock provider that keeps PTY open so WS doesn't close
	ptyReader, ptyWriter := io.Pipe()
	defer ptyWriter.Close()
	provider := &MockProvider{
		MockExecInteractive: func() (io.ReadWriteCloser, sandbox.ResizeFunc, error) {
			return &MockPTY{
				Reader: ptyReader,
				Writer: io.Discard,
				Closer: ptyReader,
			}, nil, nil
		},
	}


	mux := NewMultiplexer(provider, logger)

	handler := Handler(mgr, mux, provider, pubKey, allowedOrigins, logger)
	server := httptest.NewServer(handler)
	defer server.Close()

	// Generate valid token
	tokenStr := generateValidToken(t, privKey, userID, time.Now().Add(1*time.Hour))

	// Connect WebSocket
	wsURL := strings.Replace(server.URL, "http://", "ws://", 1) + "/sessions/" + sessionID + "/terminal"
	headers := http.Header{}
	headers.Add("Origin", "http://localhost:3000")
	headers.Add("Authorization", "Bearer "+tokenStr)

	ws, _, err := websocket.DefaultDialer.Dial(wsURL, headers)
	if err != nil {
		t.Fatalf("Failed to dial WebSocket: %v", err)
	}
	defer ws.Close()

	// Wait for the warning message
	ws.SetReadDeadline(time.Now().Add(1 * time.Second))
	
	for {
		msgType, msgData, err := ws.ReadMessage()
		if err != nil {
			t.Fatalf("Failed to read from WS or timed out waiting for warning: %v", err)
		}

		if msgType == websocket.TextMessage {
			var payload map[string]interface{}
			if err := json.Unmarshal(msgData, &payload); err == nil {
				if payload["type"] == "ttl_warning" {
					if mins, ok := payload["minutesRemaining"].(float64); !ok || mins != 5 {
						t.Errorf("Expected 5 minutes remaining, got %v", payload["minutesRemaining"])
					}
					// Success! We received the warning.
					return
				}
			}
		}
	}
}
