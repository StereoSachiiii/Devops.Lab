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

// TestSessionAffinity validates that the router correctly directs WebSocket connections
// to the correct backend worker based on the requiredProvider.
func TestSessionAffinity(t *testing.T) {
	if osURL := getGatewayURL(); osURL == "" {
		t.Skip("Skipping live stack integration test")
	}

	testCases := []struct {
		provider    string
		challengeID string
	}{
		{"docker", "chal-docker"},
		{"gvisor", "chal-gvisor"},
	}

	for _, tc := range testCases {
		t.Run("Affinity_"+tc.provider, func(t *testing.T) {
			if tc.provider == "docker" && os.Getenv("TEST_DOCKER") != "1" {
				t.Skip("Skipping Docker integration test; set TEST_DOCKER=1 to run")
			}
			if tc.provider == "gvisor" && os.Getenv("TEST_GVISOR") != "1" {
				t.Skip("Skipping gVisor integration test; set TEST_GVISOR=1 to run")
			}

			// 1. Register fresh user for each subtest to avoid concurrency limits
			email := fmt.Sprintf("affinity-test-%d@example.com", time.Now().UnixNano())
			t.Logf("Registering fresh user %s...", email)
			userID, token := registerAndLoginUser(t, email, "password123")
			if userID == "" || token == "" {
				t.Fatalf("Failed to register and login user")
			}

			challengeID := tc.challengeID
			chalReq, _ := http.NewRequest("GET", getCoreURL()+"/challenges", nil)
			chalReq.Header.Set("Authorization", "Bearer "+token)
			client := &http.Client{Timeout: 10 * time.Second}
			if chalResp, err := client.Do(chalReq); err == nil && chalResp.StatusCode == http.StatusOK {
				var chals []map[string]any
				if json.NewDecoder(chalResp.Body).Decode(&chals) == nil && len(chals) > 0 {
					challengeID = chals[0]["id"].(string)
				}
				chalResp.Body.Close()
			}

			t.Logf("Starting session for provider %s using challenge ID %s...", tc.provider, challengeID)

			req, _ := http.NewRequest("POST", getCoreURL()+"/challenges/"+challengeID+"/start", nil)
			req.Header.Set("Authorization", "Bearer "+token)

			resp, err := client.Do(req)
			if err != nil || (resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated) {
				body, _ := io.ReadAll(resp.Body)
				t.Fatalf("Failed to start %s session: %v (status %d, body: %s)", tc.provider, err, resp.StatusCode, string(body))
			}
			defer resp.Body.Close()

			var sessionInfo StartSessionResponse
			_ = json.NewDecoder(resp.Body).Decode(&sessionInfo)
			if sessionInfo.SessionID == "" {
				t.Fatalf("No valid SessionID returned")
			}

			// Wait up to 10s for container to provision
			t.Log("Waiting for session to become healthy...")
			healthURL := getGatewayURL() + "/sessions/" + sessionInfo.SessionID + "/health"
			healthy := false
			for i := 0; i < 40; i++ {
				hReq, _ := http.NewRequest("GET", healthURL, nil)
				hReq.Header.Set("Authorization", "Bearer "+token)
				hResp, hErr := client.Do(hReq)
				if hErr == nil && hResp.StatusCode == http.StatusOK {
					var h map[string]any
					_ = json.NewDecoder(hResp.Body).Decode(&h)
					hResp.Body.Close()
					if alive, ok := h["alive"].(bool); ok && alive {
						healthy = true
						break
					}
				}
				time.Sleep(250 * time.Millisecond)
			}

			if !healthy {
				t.Fatalf("Session %s failed to become healthy", sessionInfo.SessionID)
			}

			t.Log("Connecting WebSocket to router...")
			wsBaseURL := strings.Replace(getGatewayURL(), "http://", "ws://", 1)
			wsBaseURL = strings.Replace(wsBaseURL, "https://", "wss://", 1)
			wsURL := fmt.Sprintf("%s/sessions/%s/terminal?cols=80&rows=24", wsBaseURL, sessionInfo.SessionID)

			dialer := websocket.Dialer{}
			headers := http.Header{}
			headers.Set("Authorization", "Bearer "+token)
			headers.Set("Origin", "http://localhost:3000") // valid allowed origin

			conn, _, err := dialer.Dial(wsURL, headers)
			if err != nil {
				t.Fatalf("WebSocket connection failed: %v", err)
			}
			defer conn.Close()

			t.Log("✅ WebSocket connected successfully through sandbox-router")

			// Wait for READY event to ensure PTY is attached
			t.Log("Waiting for READY event...")
			for {
				conn.SetReadDeadline(time.Now().Add(30 * time.Second))
				msgType, msgData, err := conn.ReadMessage()
				if err != nil {
					t.Fatalf("Failed waiting for READY: %v", err)
				}
				if msgType == websocket.TextMessage && strings.Contains(string(msgData), `"stage":"READY"`) {
					t.Log("✅ Received READY event")
					break
				}
			}

			// Send a command and verify output
			t.Log("Sending command to terminal...")
			cmd := fmt.Sprintf("echo 'AffinityTest_%s'\n", tc.provider)
			_ = conn.WriteMessage(websocket.BinaryMessage, []byte(cmd))

			// Read back until we see the string
			found := false
			conn.SetReadDeadline(time.Now().Add(5 * time.Second))
			for i := 0; i < 20; i++ {
				_, msg, err := conn.ReadMessage()
				if err != nil {
					t.Logf("ReadMessage error: %v", err)
					break
				}
				t.Logf("Received message: %s", string(msg))
				if strings.Contains(string(msg), "AffinityTest_"+tc.provider) {
					found = true
					break
				}
			}

			if !found {
				t.Fatalf("Did not receive expected command output from terminal")
			}
			t.Logf("✅ Successfully executed command on %s tier through sandbox-router", tc.provider)
		})
	}
}
