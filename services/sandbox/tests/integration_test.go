package tests

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

// Configurable endpoint URLs for the real running stack
func getGatewayURL() string {
	if u := os.Getenv("API_GATEWAY_URL"); u != "" {
		return u
	}
	return "http://localhost:8005"
}

func getAuthURL() string {
	if u := os.Getenv("AUTH_SERVICE_URL"); u != "" {
		return u
	}
	return getGatewayURL() + "/api/auth"
}

func getCoreURL() string {
	if u := os.Getenv("CORE_SERVICE_URL"); u != "" {
		return u
	}
	return getGatewayURL() + "/api"
}

func getSandboxURL() string {
	if u := os.Getenv("SANDBOX_SERVICE_URL"); u != "" {
		return u
	}
	return "http://localhost:8090"
}

type RegisterResponse struct {
	User struct {
		ID    string `json:"id"`
		Email string `json:"email"`
	} `json:"user"`
	Token string `json:"token"`
}

type StartSessionResponse struct {
	SessionID      string `json:"sessionId"`
	ChallengeID    string `json:"challengeId"`
	ChallengeTitle string `json:"challengeTitle"`
	TerminalURL    string `json:"terminalUrl"`
	ValidateURL    string `json:"validateUrl"`
}

type ValidationResponse struct {
	Passed   bool   `json:"passed"`
	Feedback string `json:"feedback"`
}

func assertEqualStr(t *testing.T, expected, actual, msg string) {
	t.Helper()
	if expected != actual {
		t.Errorf("%s: expected '%s', got '%s'", msg, expected, actual)
	}
}

// waitForHealthySession polls the /health endpoint until the session is ready.
func waitForHealthySession(t *testing.T, sessionID, token string) error {
	t.Helper()
	healthURL := getSandboxURL() + "/sessions/" + sessionID + "/health"
	client := &http.Client{}
	
	for i := 0; i < 40; i++ {
		hReq, _ := http.NewRequest("GET", healthURL, nil)
		if token != "" {
			hReq.Header.Set("Authorization", "Bearer "+token)
		}
		hResp, hErr := client.Do(hReq)
		if hErr == nil {
			var h map[string]any
			_ = json.NewDecoder(hResp.Body).Decode(&h)
			hResp.Body.Close()
			if alive, ok := h["alive"].(bool); ok && alive {
				return nil
			}
		}
		time.Sleep(250 * time.Millisecond)
	}
	return fmt.Errorf("timeout waiting for session %s to become healthy", sessionID)
}

// helper to register & log in a fresh unique user
func registerAndLoginUser(t *testing.T, email, password string) (string, string) {
	t.Helper()

	// 1. Register fresh user
	regPayload, _ := json.Marshal(map[string]string{
		"email":    email,
		"password": password,
		"name":     "Integration Test User",
	})

	resp, err := http.Post(getAuthURL()+"/register", "application/json", bytes.NewBuffer(regPayload))
	if err != nil {
		t.Skipf("Skipping live integration test (live API gateway is not currently running: %v)", err)
		return "", ""
	}
	defer resp.Body.Close()

	bodyBytes, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		t.Fatalf("Register failed with status %d: %s", resp.StatusCode, string(bodyBytes))
	}

	var regData RegisterResponse
	_ = json.Unmarshal(bodyBytes, &regData)

	// 2. Login fresh user to get session cookie/token
	loginPayload, _ := json.Marshal(map[string]string{
		"email":    email,
		"password": password,
	})

	req, _ := http.NewRequest("POST", getAuthURL()+"/login", bytes.NewBuffer(loginPayload))
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	loginResp, err := client.Do(req)
	if err != nil {
		t.Fatalf("Failed to call login endpoint: %v", err)
	}
	defer loginResp.Body.Close()

	loginBody, _ := io.ReadAll(loginResp.Body)
	if loginResp.StatusCode != http.StatusOK {
		t.Fatalf("Login failed with status %d: %s", loginResp.StatusCode, string(loginBody))
	}

	// Extract access token or token from body/cookie
	token := regData.Token
	if token == "" {
		var loginData map[string]interface{}
		if err := json.Unmarshal(loginBody, &loginData); err == nil {
			if tok, ok := loginData["token"].(string); ok {
				token = tok
			}
		}
	}

	// If token wasn't in JSON body, check Set-Cookie
	if token == "" {
		for _, cookie := range loginResp.Cookies() {
			if cookie.Name == "token" || cookie.Name == "accessToken" {
				token = cookie.Value
				break
			}
		}
	}

	return regData.User.ID, token
}

// TestFullStackIntegration tests the end-to-end sandbox lifecycle against a live stack.
func TestFullStackIntegration(t *testing.T) {
	if os.Getenv("TEST_INTEGRATION") != "1" {
		t.Skip("Skipping live stack integration test; set TEST_INTEGRATION=1 to run")
	}

	// Check if live stack is reachable before running
	checkResp, err := http.Get(getAuthURL() + "/health")
	if err != nil || (checkResp.StatusCode != http.StatusOK && checkResp.StatusCode != http.StatusNotFound) {
		t.Skipf("Skipping live stack test: Auth service not reachable at %s: %v", getAuthURL(), err)
	}

	userEmail := fmt.Sprintf("sandbox-test-%d@example.com", time.Now().UnixNano())
	userPassword := "TestPassword123!"

	t.Logf("Step 1: Registering fresh user %s...", userEmail)
	userID, token := registerAndLoginUser(t, userEmail, userPassword)
	if token == "" {
		t.Fatalf("Failed to obtain real JWT auth token for registered user %s", userID)
	}
	t.Logf("✅ Successfully registered & logged in user. User ID: %s", userID)

	// Step 2: Start a challenge session using THAT real authenticated token
	// First fetch available challenges to get a valid challenge ID
	t.Log("Fetching available challenges from Core API...")
	req, _ := http.NewRequest("GET", getCoreURL()+"/challenges", nil)
	req.Header.Set("Authorization", "Bearer "+token)

	client := &http.Client{Timeout: 10 * time.Second}
	chalResp, err := client.Do(req)
	if err != nil || chalResp.StatusCode != http.StatusOK {
		t.Fatalf("Failed to fetch challenges from Core API: %v (status: %d)", err, chalResp.StatusCode)
	}
	defer chalResp.Body.Close()

	var challenges []map[string]interface{}
	_ = json.NewDecoder(chalResp.Body).Decode(&challenges)
	if len(challenges) == 0 {
		t.Fatalf("No challenges found in DB to perform integration test")
	}

	targetChallengeID := challenges[0]["id"].(string)
	targetTitle := challenges[0]["title"].(string)
	t.Logf("Selected challenge: %s (ID: %s)", targetTitle, targetChallengeID)

	// Start challenge session
	startReq, _ := http.NewRequest("POST", getCoreURL()+"/challenges/"+targetChallengeID+"/start", nil)
	startReq.Header.Set("Authorization", "Bearer "+token)

	startResp, err := client.Do(startReq)
	if err != nil || (startResp.StatusCode != http.StatusOK && startResp.StatusCode != http.StatusCreated) {
		startBody, _ := io.ReadAll(startResp.Body)
		t.Fatalf("Failed to start challenge session: %v (status %d, body: %s)", err, startResp.StatusCode, string(startBody))
	}
	defer startResp.Body.Close()

	var sessionInfo StartSessionResponse
	_ = json.NewDecoder(startResp.Body).Decode(&sessionInfo)
	if sessionInfo.SessionID == "" {
		t.Fatalf("Start session response did not contain a valid SessionID: %+v", sessionInfo)
	}
	t.Logf("✅ Successfully started lab session: %s", sessionInfo.SessionID)

	// Step 3: Test Reconnection Idempotency
	// Two "start" requests for the same authenticated user + same challenge should return the SAME session
	t.Log("Step 3: Testing Reconnection Idempotency (duplicate start request)...")
	reconnectReq, _ := http.NewRequest("POST", getCoreURL()+"/challenges/"+targetChallengeID+"/start", nil)
	reconnectReq.Header.Set("Authorization", "Bearer "+token)

	reconnectResp, err := client.Do(reconnectReq)
	if err != nil || reconnectResp.StatusCode != http.StatusOK {
		t.Fatalf("Duplicate start request failed: %v (status: %d)", err, reconnectResp.StatusCode)
	}
	defer reconnectResp.Body.Close()

	var reconnectInfo StartSessionResponse
	_ = json.NewDecoder(reconnectResp.Body).Decode(&reconnectInfo)
	if reconnectInfo.SessionID != sessionInfo.SessionID {
		t.Fatalf("Idempotency failure! Duplicate start request returned a different session ID. Expected %s, got %s",
			sessionInfo.SessionID, reconnectInfo.SessionID)
	}
	t.Logf("✅ Reconnection Idempotency verified: returned same SessionID %s", reconnectInfo.SessionID)

	// Step 4: WebSocket Terminal Authentication & Origin Enforcement
	t.Log("Step 4: Testing WebSocket Terminal Origin Enforcement and Authentication...")

	// Wait up to 10s for outbox poller & sandbox-worker to provision container in Redis
	err = waitForHealthySession(t, sessionInfo.SessionID, token)
	if err != nil {
		t.Fatalf("Session did not become healthy: %v", err)
	}
	t.Log("✅ Sandbox container provisioned & healthy in worker.")

	wsBaseURL := strings.Replace(getSandboxURL(), "http://", "ws://", 1)
	wsBaseURL = strings.Replace(wsBaseURL, "https://", "wss://", 1)
	wsTerminalURL := fmt.Sprintf("%s/sessions/%s/terminal?cols=120&rows=40", wsBaseURL, sessionInfo.SessionID)

	// Test 4a: Disallowed Origin -> Rejected
	t.Run("Disallowed Origin Rejected", func(t *testing.T) {
		dialer := websocket.Dialer{}
		headers := http.Header{}
		headers.Set("Origin", "http://disallowed-evil-origin.com")
		headers.Set("Authorization", "Bearer "+token)

		_, resp, err := dialer.Dial(wsTerminalURL, headers)
		if err == nil {
			t.Fatalf("Expected WebSocket connection with disallowed Origin to be rejected, but it succeeded")
		}
		if resp != nil && resp.StatusCode != http.StatusForbidden && resp.StatusCode != http.StatusBadRequest {
			t.Errorf("Expected status 403/400 for disallowed Origin, got %d", resp.StatusCode)
		}
		t.Log("✅ Disallowed Origin correctly rejected.")
	})

	// Test 4b: Invalid Auth Token -> Rejected
	t.Run("Invalid Auth Token Rejected", func(t *testing.T) {
		dialer := websocket.Dialer{}
		headers := http.Header{}
		headers.Set("Origin", "http://localhost:3000")
		headers.Set("Authorization", "Bearer invalid.jwt.token")

		_, resp, err := dialer.Dial(wsTerminalURL, headers)
		if err == nil {
			t.Fatalf("Expected WebSocket connection with invalid auth token to be rejected, but it succeeded")
		}
		if resp != nil && resp.StatusCode != http.StatusUnauthorized {
			t.Errorf("Expected status 401 Unauthorized for invalid token, got %d", resp.StatusCode)
		}
		t.Log("✅ Invalid Auth Token correctly rejected.")
	})

	// Test 4c: Valid Origin + Valid Auth Token -> HTTP 101 Upgrade Success
	t.Run("Valid Auth Token + Valid Origin Connects & Executes Commands", func(t *testing.T) {
		dialer := websocket.Dialer{HandshakeTimeout: 10 * time.Second}
		headers := http.Header{}
		headers.Set("Origin", "http://localhost:3000")
		headers.Set("Authorization", "Bearer "+token)

		conn, resp, err := dialer.Dial(wsTerminalURL, headers)
		if err != nil {
			if resp != nil {
				t.Fatalf("WebSocket upgrade failed with HTTP status %d: %v", resp.StatusCode, err)
			}
			t.Fatalf("WebSocket dial failed: %v", err)
		}
		defer conn.Close()

		if resp.StatusCode != http.StatusSwitchingProtocols {
			t.Fatalf("Expected HTTP 101 Switching Protocols, got %d", resp.StatusCode)
		}
		t.Log("✅ WebSocket upgrade succeeded (HTTP 101 Switching Protocols).")

		// Step 5: Send a real command through WebSocket & confirm stdout output returns
		cmd := "echo REAL_SANDBOX_ECHO_VERIFICATION\n"
		if err := conn.WriteMessage(websocket.BinaryMessage, []byte(cmd)); err != nil {
			t.Fatalf("Failed to write binary message over WebSocket: %v", err)
		}

		// Read output until expected verification string is seen or deadline reached
		_ = conn.SetReadDeadline(time.Now().Add(10 * time.Second))
		foundEcho := false
		for i := 0; i < 20; i++ {
			msgType, payload, err := conn.ReadMessage()
			if err != nil {
				break
			}
			if msgType == websocket.BinaryMessage {
				if strings.Contains(string(payload), "REAL_SANDBOX_ECHO_VERIFICATION") {
					foundEcho = true
					break
				}
			}
		}

		if !foundEcho {
			t.Fatalf("Expected output containing 'REAL_SANDBOX_ECHO_VERIFICATION' over PTY WebSocket binary frames")
		}
		t.Log("✅ Real terminal command output received over WebSocket PTY binary stream.")
	})

	// Step 6: Inverse Validation Scenario (Objective Failure on untouched session)
	t.Log("Step 6: Testing Inverse Challenge Validation (Failure Scenario)...")
	validateURL := sessionInfo.ValidateURL
	if validateURL == "" {
		validateURL = getGatewayURL() + "/validate/" + sessionInfo.SessionID
	} else {
		// Replace localhost with the actual gateway URL if we are in the docker test network
		if strings.HasPrefix(validateURL, "http://localhost:8005") {
			validateURL = strings.Replace(validateURL, "http://localhost:8005", getGatewayURL(), 1)
		}
	}

	valFailReq, _ := http.NewRequest("POST", validateURL, nil)
	valFailReq.Header.Set("Authorization", "Bearer "+token)

	valFailResp, err := client.Do(valFailReq)
	if err != nil {
		t.Fatalf("Validation request failed: %v", err)
	}
	defer valFailResp.Body.Close()

	valFailBytes, _ := io.ReadAll(valFailResp.Body)
	var valFailRes ValidationResponse
	_ = json.Unmarshal(valFailBytes, &valFailRes)

	if valFailResp.StatusCode == http.StatusOK && valFailRes.Passed {
		t.Fatalf("Validation rubber-stamped success on untouched challenge! Expected failure. Body: %s", string(valFailBytes))
	}
	t.Logf("✅ Inverse validation correctly reported failure on untouched challenge (Status: %d, Passed: false).", valFailResp.StatusCode)

	// Step 7: Container Cleanup Test
	t.Log("Step 7: Testing Container Cleanup on Session Termination...")
	termReq, _ := http.NewRequest("DELETE", getCoreURL()+"/session/"+sessionInfo.SessionID, nil)
	termReq.Header.Set("Authorization", "Bearer "+token)

	termResp, err := client.Do(termReq)
	if err != nil || termResp.StatusCode != http.StatusOK {
		t.Fatalf("Session termination request failed: %v", err)
	}
	defer termResp.Body.Close()

	// Probe health endpoint after termination to confirm sandbox container is destroyed
	healthReq, _ := http.NewRequest("GET", getSandboxURL()+"/sessions/"+sessionInfo.SessionID+"/health", nil)
	healthReq.Header.Set("Authorization", "Bearer "+token)

	healthResp, err := client.Do(healthReq)
	if err == nil && healthResp.StatusCode == http.StatusOK {
		var healthData map[string]interface{}
		_ = json.NewDecoder(healthResp.Body).Decode(&healthData)
		healthResp.Body.Close()

		if alive, ok := healthData["alive"].(bool); ok && alive {
			t.Fatalf("Container leak detected! Health probe reports session %s is still alive after termination", sessionInfo.SessionID)
		}
	}
	t.Log("✅ Container cleanup verified: session terminated and sandbox container stopped/removed.")
}

func parseURL(s string) *url.URL {
	u, _ := url.Parse(s)
	return u
}

func TestProgressEvents_Integration(t *testing.T) {
	if os.Getenv("TEST_INTEGRATION") != "1" {
		t.Skip("Skipping live stack integration test; set TEST_INTEGRATION=1 to run")
	}

	email := fmt.Sprintf("progresstest_%d@example.com", time.Now().UnixNano())
	_, token := registerAndLoginUser(t, email, "TestPassword123!")

	client := &http.Client{Timeout: 10 * time.Second}
	req, _ := http.NewRequest("GET", getCoreURL()+"/challenges", nil)
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := client.Do(req)
	if err != nil || resp.StatusCode != http.StatusOK {
		t.Fatalf("Failed to fetch challenges: %v", err)
	}
	defer resp.Body.Close()

	var challenges []map[string]interface{}
	_ = json.NewDecoder(resp.Body).Decode(&challenges)
	if len(challenges) == 0 {
		t.Skip("No challenges found to test progress events")
	}
	challengeID := challenges[0]["id"].(string)

	startReq, _ := http.NewRequest("POST", getCoreURL()+"/challenges/"+challengeID+"/start", nil)
	startReq.Header.Set("Authorization", "Bearer "+token)

	startResp, err := client.Do(startReq)
	if err != nil || (startResp.StatusCode != http.StatusOK && startResp.StatusCode != http.StatusCreated) {
		b, _ := io.ReadAll(startResp.Body)
		t.Fatalf("Failed to start challenge session: %v (Status: %d, Body: %s)", err, startResp.StatusCode, string(b))
	}
	defer startResp.Body.Close()

	var sessionInfo StartSessionResponse
	_ = json.NewDecoder(startResp.Body).Decode(&sessionInfo)

	wsURL := sessionInfo.TerminalURL
	if wsURL == "" {
		wsURL = fmt.Sprintf("ws://localhost:8090/sessions/%s/terminal", sessionInfo.SessionID)
	} else {
		wsURL = strings.Replace(wsURL, "http://", "ws://", 1)
		wsURL = strings.Replace(wsURL, "https://", "wss://", 1)
		// Replace localhost with the actual gateway URL if we are in the docker test network
		if strings.HasPrefix(wsURL, "ws://localhost:8005") {
			wsGateway := strings.Replace(getGatewayURL(), "http://", "ws://", 1)
			wsURL = strings.Replace(wsURL, "ws://localhost:8005", wsGateway, 1)
		}
	}

	header := http.Header{}
	header.Set("Authorization", "Bearer "+token)
	header.Set("Origin", "http://localhost:3000")

	var conn *websocket.Conn
	var dialErr error
	for i := 0; i < 20; i++ {
		conn, _, dialErr = websocket.DefaultDialer.Dial(wsURL, header)
		if dialErr == nil {
			break
		}
		time.Sleep(250 * time.Millisecond)
	}
	if dialErr != nil {
		t.Fatalf("Failed to dial WebSocket after retries: %v", dialErr)
	}
	defer conn.Close()

	stagesReceived := make(map[string]bool)
	_ = conn.SetReadDeadline(time.Now().Add(10 * time.Second))

	for {
		msgType, payload, err := conn.ReadMessage()
		if err != nil {
			break
		}
		if msgType == websocket.TextMessage {
			var evt map[string]interface{}
			if err := json.Unmarshal(payload, &evt); err == nil {
				if evtType, ok := evt["type"].(string); ok && evtType == "progress" {
					if stage, ok := evt["stage"].(string); ok {
						stagesReceived[stage] = true
						t.Logf("Received progress event stage: %s (%s)", stage, evt["message"])
						if stage == "READY" {
							break
						}
					}
				}
			}
		}
	}

	if !stagesReceived["READY"] {
		t.Fatalf("Expected READY progress event stage, received stages: %v", stagesReceived)
	}

	t.Logf("✅ Real progress events successfully received over WebSocket! Stages: %v", stagesReceived)
}

func TestIsolationDowngrade_Integration(t *testing.T) {
	if os.Getenv("TEST_INTEGRATION") != "1" {
		t.Skip("Skipping live stack integration test; set TEST_INTEGRATION=1 to run")
	}
	if os.Getenv("TEST_GVISOR") != "1" {
		t.Skip("Skipping gVisor test; set TEST_GVISOR=1 to run")
	}

	email := fmt.Sprintf("down-%d@example.com", time.Now().UnixNano())
	_, token := registerAndLoginUser(t, email, "TestPassword123!")

	// Start a gvisor challenge session (which will be processed by sandbox-worker-gvisor)
	client := &http.Client{Timeout: 10 * time.Second}
	startReq, _ := http.NewRequest("POST", getCoreURL()+"/challenges/chal-gvisor/start", nil)
	startReq.Header.Set("Authorization", "Bearer "+token)

	startResp, err := client.Do(startReq)
	if err != nil || (startResp.StatusCode != http.StatusOK && startResp.StatusCode != http.StatusCreated) {
		b, _ := io.ReadAll(startResp.Body)
		t.Fatalf("Failed to start challenge session: %v (Status: %d, Body: %s)", err, startResp.StatusCode, string(b))
	}
	defer startResp.Body.Close()

	var sessionInfo StartSessionResponse
	_ = json.NewDecoder(startResp.Body).Decode(&sessionInfo)

	wsURL := sessionInfo.TerminalURL
	if wsURL == "" {
		wsURL = fmt.Sprintf("ws://localhost:8090/sessions/%s/terminal", sessionInfo.SessionID)
	} else {
		wsURL = strings.Replace(wsURL, "http://", "ws://", 1)
		wsURL = strings.Replace(wsURL, "https://", "wss://", 1)
		if strings.HasPrefix(wsURL, "ws://localhost:8005") {
			wsGateway := strings.Replace(getGatewayURL(), "http://", "ws://", 1)
			wsURL = strings.Replace(wsURL, "ws://localhost:8005", wsGateway, 1)
		}
	}

	header := http.Header{}
	header.Set("Authorization", "Bearer "+token)
	header.Set("Origin", "http://localhost:3000")

	var conn *websocket.Conn
	var dialErr error
	for i := 0; i < 20; i++ {
		conn, _, dialErr = websocket.DefaultDialer.Dial(wsURL, header)
		if dialErr == nil {
			break
		}
		time.Sleep(250 * time.Millisecond)
	}
	if dialErr != nil {
		t.Fatalf("Failed to dial WebSocket after retries: %v", dialErr)
	}
	defer conn.Close()

	stagesReceived := make(map[string]bool)
	_ = conn.SetReadDeadline(time.Now().Add(10 * time.Second))

	for {
		msgType, payload, err := conn.ReadMessage()
		if err != nil {
			break
		}
		if msgType == websocket.TextMessage {
			var evt map[string]interface{}
			if err := json.Unmarshal(payload, &evt); err == nil {
				if evtType, ok := evt["type"].(string); ok && evtType == "progress" {
					if stage, ok := evt["stage"].(string); ok {
						stagesReceived[stage] = true
						t.Logf("Received stage: %s (%s)", stage, evt["message"])
						if stage == "READY" {
							break
						}
					}
				}
			}
		}
	}

	if !stagesReceived["ISOLATION_DOWNGRADED"] {
		t.Fatalf("Expected ISOLATION_DOWNGRADED progress event stage, received stages: %v", stagesReceived)
	}
	t.Log("✅ ISOLATION_DOWNGRADED progress event successfully verified!")
}
