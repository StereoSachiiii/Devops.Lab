package tests

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func TestTTLWarning_Integration(t *testing.T) {
	if os.Getenv("TEST_INTEGRATION") != "1" {
		t.Skip("Skipping live stack integration test; set TEST_INTEGRATION=1 to run")
	}

	checkResp, err := http.Get(getAuthURL() + "/health")
	if err != nil || (checkResp.StatusCode != http.StatusOK && checkResp.StatusCode != http.StatusNotFound) {
		t.Skipf("Skipping live stack test: Auth service not reachable at %s: %v", getAuthURL(), err)
	}

	userEmail := fmt.Sprintf("ttl-test-%d@example.com", time.Now().UnixNano())
	userPassword := "TestPassword123!"

	t.Logf("Step 1: Registering fresh user %s...", userEmail)
	userID, token := registerAndLoginUser(t, userEmail, userPassword)
	if token == "" {
		t.Fatalf("Failed to obtain real JWT auth token for registered user %s", userID)
	}
	t.Logf("✅ Successfully registered & logged in user. User ID: %s", userID)

	t.Log("Fetching available challenges from Core API...")
	req, _ := http.NewRequest("GET", getCoreURL()+"/challenges", nil)
	req.Header.Set("Authorization", "Bearer "+token)

	client := &http.Client{Timeout: 10 * time.Second}
	chalResp, err := client.Do(req)
	if err != nil || chalResp.StatusCode != http.StatusOK {
		t.Fatalf("Failed to fetch challenges from Core API: %v", err)
	}
	defer chalResp.Body.Close()

	var challenges []map[string]interface{}
	_ = json.NewDecoder(chalResp.Body).Decode(&challenges)
	if len(challenges) == 0 {
		t.Fatalf("No challenges found in DB to perform integration test")
	}

	targetChallengeID := challenges[0]["id"].(string)
	t.Logf("Selected challenge ID: %s", targetChallengeID)

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

	if err := waitForHealthySession(t, sessionInfo.SessionID, token); err != nil {
		t.Fatalf("Failed waiting for session to become healthy: %v", err)
	}

	wsURL := strings.Replace(sessionInfo.TerminalURL, "http://", "ws://", 1)
	if h := os.Getenv("WS_HOST"); h != "" {
		wsURL = strings.Replace(wsURL, "localhost", h, 1)
	}
	t.Logf("Step 3: Connecting to WebSocket at %s", wsURL)

	headers := http.Header{}
	headers.Add("Origin", "http://localhost:3000") // Required for CORS/Origin check
	headers.Add("Authorization", "Bearer "+token)

	ws, resp, err := websocket.DefaultDialer.Dial(wsURL, headers)
	if err != nil {
		body := ""
		if resp != nil {
			b, _ := io.ReadAll(resp.Body)
			body = string(b)
		}
		t.Fatalf("Failed to dial WebSocket: %v (body: %s)", err, body)
	}
	defer ws.Close()

	t.Logf("✅ WebSocket connected! Waiting for ttl_warning event...")

	// Since we set TTL to 1 minute, the warning should arrive in ~30 seconds.
	// We wait up to 45 seconds to be safe.
	ws.SetReadDeadline(time.Now().Add(45 * time.Second))

	var receivedWarning bool
	for {
		msgType, msgData, err := ws.ReadMessage()
		if err != nil {
			t.Fatalf("Failed to read from WS or timed out: %v", err)
		}

		if msgType == websocket.TextMessage {
			var payload map[string]interface{}
			if err := json.Unmarshal(msgData, &payload); err == nil {
				if payload["type"] == "ttl_warning" {
					mins, _ := payload["minutesRemaining"].(float64)
					t.Logf("🎉 Received ttl_warning! Minutes remaining: %v", mins)
					receivedWarning = true
					break
				}
			}
		}
	}

	if !receivedWarning {
		t.Fatalf("Did not receive ttl_warning before timeout")
	}
}
