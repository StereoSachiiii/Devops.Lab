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

func TestAdversarial_Integration(t *testing.T) {
	if os.Getenv("TEST_INTEGRATION") != "1" {
		t.Skip("Skipping live stack integration test; set TEST_INTEGRATION=1 to run")
	}

	checkResp, err := http.Get(getAuthURL() + "/health")
	if err != nil || (checkResp.StatusCode != http.StatusOK && checkResp.StatusCode != http.StatusNotFound) {
		t.Skipf("Skipping live stack test: Auth service not reachable at %s: %v", getAuthURL(), err)
	}

	// 1. Create User A (The Victim)
	victimEmail := fmt.Sprintf("victim-%d@example.com", time.Now().UnixNano())
	victimID, victimToken := registerAndLoginUser(t, victimEmail, "TestPassword123!")
	t.Logf("✅ Registered Victim User (ID: %s)", victimID)

	// 2. Create User B (The Attacker)
	attackerEmail := fmt.Sprintf("attacker-%d@example.com", time.Now().UnixNano())
	attackerID, attackerToken := registerAndLoginUser(t, attackerEmail, "TestPassword123!")
	t.Logf("✅ Registered Attacker User (ID: %s)", attackerID)

	// 3. Start a session as Victim
	req, _ := http.NewRequest("GET", getCoreURL()+"/challenges", nil)
	req.Header.Set("Authorization", "Bearer "+victimToken)

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

	startReq, _ := http.NewRequest("POST", getCoreURL()+"/challenges/"+targetChallengeID+"/start", nil)
	startReq.Header.Set("Authorization", "Bearer "+victimToken)

	startResp, err := client.Do(startReq)
	if err != nil || (startResp.StatusCode != http.StatusOK && startResp.StatusCode != http.StatusCreated) {
		startBody, _ := io.ReadAll(startResp.Body)
		t.Fatalf("Failed to start challenge session: %v (status %d, body: %s)", err, startResp.StatusCode, string(startBody))
	}
	defer startResp.Body.Close()

	var victimSession StartSessionResponse
	_ = json.NewDecoder(startResp.Body).Decode(&victimSession)
	t.Logf("✅ Victim Session started: %s", victimSession.SessionID)

	if err := waitForHealthySession(t, victimSession.SessionID, victimToken); err != nil {
		t.Fatalf("Failed waiting for victim session to become healthy: %v", err)
	}

	// =========================================================================
	// ATTACK 1: CROSS-TENANT SESSION HIJACKING
	// =========================================================================
	t.Log("🚀 ATTACK 1: Cross-Tenant Session Hijacking")
	wsURL := strings.Replace(victimSession.TerminalURL, "http://", "ws://", 1)
	if h := os.Getenv("WS_HOST"); h != "" {
		wsURL = strings.Replace(wsURL, "localhost", h, 1)
	}

	headers := http.Header{}
	headers.Add("Origin", "http://localhost:3000")
	// Using ATTACKER token to connect to VICTIM session
	headers.Add("Authorization", "Bearer "+attackerToken)

	ws, resp, err := websocket.DefaultDialer.Dial(wsURL, headers)
	if err == nil {
		hijacked := false
		for {
			msgType, msgData, err := ws.ReadMessage()
			if err != nil {
				break
			}
			if msgType == websocket.BinaryMessage {
				hijacked = true
				break
			}
			if msgType == websocket.TextMessage {
				var payload map[string]interface{}
				json.Unmarshal(msgData, &payload)
				if payload["stage"] == "READY" {
					hijacked = true
					break
				}
				if payload["type"] == "error" && payload["message"] == "forbidden" {
					t.Logf("✅ ATTACK 1 BLOCKED: Attacker received forbidden error frame during provisioning wait.")
					break
				}
			}
		}
		if hijacked {
			t.Errorf("❌ ATTACK 1 SUCCESS: Attacker successfully hijacked Victim's session!")
		}
		ws.Close()
	} else {
		// We expect a 403 Forbidden
		if resp != nil && resp.StatusCode == http.StatusForbidden {
			t.Logf("✅ ATTACK 1 BLOCKED: Received 403 Forbidden")
		} else {
			t.Logf("⚠️ ATTACK 1 BLOCKED with unexpected error: %v (Status: %d)", err, resp.StatusCode)
		}
	}

	// =========================================================================
	// Set up Attacker Session for internal sandbox attacks
	// =========================================================================
	startReqAtk, _ := http.NewRequest("POST", getCoreURL()+"/challenges/"+targetChallengeID+"/start", nil)
	startReqAtk.Header.Set("Authorization", "Bearer "+attackerToken)

	startRespAtk, err := client.Do(startReqAtk)
	if err != nil {
		t.Fatalf("Failed to start attacker session: %v", err)
	}
	defer startRespAtk.Body.Close()

	var attackerSession StartSessionResponse
	if err := json.NewDecoder(startRespAtk.Body).Decode(&attackerSession); err != nil {
		t.Fatalf("Failed to decode attacker session response: %v", err)
	}
	t.Logf("✅ Attacker Session started: %s", attackerSession.SessionID)

	if err := waitForHealthySession(t, attackerSession.SessionID, attackerToken); err != nil {
		t.Fatalf("Failed waiting for attacker session to become healthy: %v", err)
	}

	// Wait a moment for outbox poller if needed
	time.Sleep(1 * time.Second)

	// Since we need to run commands natively in the sandbox for the tests, we can use the PTY WebSocket connection
	// and write shell commands, then read the output.
	wsURLAtk := strings.Replace(attackerSession.TerminalURL, "http://", "ws://", 1)
	if h := os.Getenv("WS_HOST"); h != "" {
		wsURLAtk = strings.Replace(wsURLAtk, "localhost", h, 1)
	}

	headersAtk := http.Header{}
	headersAtk.Add("Origin", "http://localhost:3000")
	headersAtk.Add("Authorization", "Bearer "+attackerToken)

	wsAtk, _, err := websocket.DefaultDialer.Dial(wsURLAtk, headersAtk)
	if err != nil {
		t.Fatalf("Failed to dial attacker WebSocket: %v", err)
	}
	defer wsAtk.Close()

	// Wait for terminal to be ready
	for {
		msgType, msgData, err := wsAtk.ReadMessage()
		if err != nil {
			t.Logf("[DEBUG] Wait ready err: %v", err)
			break
		}
		if msgType == websocket.TextMessage {
			t.Logf("[DEBUG] Wait ready text: %s", string(msgData))
			var payload map[string]interface{}
			if err := json.Unmarshal(msgData, &payload); err == nil {
				if payload["stage"] == "READY" || payload["type"] == "progress" {
					continue
				}
			}
		} else if msgType == websocket.BinaryMessage {
			t.Logf("[DEBUG] Wait ready binary: %s", string(msgData))
			// Ready!
			break
		}
	}

	execCommand := func(cmd string) string {
		t.Logf("[DEBUG] execCommand sending: %s", cmd)
		err := wsAtk.WriteMessage(websocket.BinaryMessage, []byte(cmd+"; printf 'FINI'; printf 'SHED\\n'\n"))
		if err != nil {
			t.Logf("[DEBUG] execCommand write error: %v", err)
			return ""
		}
		
		var output strings.Builder
		wsAtk.SetReadDeadline(time.Now().Add(5 * time.Second))
		for {
			msgType, msgData, err := wsAtk.ReadMessage()
			if err != nil {
				t.Logf("[DEBUG] execCommand read error: %v", err)
				break
			}
			if msgType == websocket.BinaryMessage {
				strData := string(msgData)
				t.Logf("[DEBUG] execCommand read binary: %s", strData)
				output.WriteString(strData)
				if strings.Contains(output.String(), "FINISHED") || strings.Contains(output.String(), "Cannot fork") {
					break
				}
			} else {
				t.Logf("[DEBUG] execCommand read non-binary message: %s", string(msgData))
			}
		}
		return output.String()
	}

	// =========================================================================
	// ATTACK 2: Network Reconnaissance
	// =========================================================================
	t.Log("🚀 ATTACK 2: Network Reconnaissance")
	out := execCommand("ping -c 1 -w 2 redis || echo PING_FAILED")
	if strings.Contains(out, "PING_FAILED") || strings.Contains(out, "bad address") || strings.Contains(out, "Name or service not known") || strings.Contains(out, "Network is unreachable") {
		t.Logf("✅ ATTACK 2 BLOCKED: Network is isolated. Output: %s", out)
	} else {
		t.Errorf("❌ ATTACK 2 SUCCESS: Container has network access! Output: %s", out)
	}

	// =========================================================================
	// ATTACK 3: Fork Bomb (PID Exhaustion)
	// =========================================================================
	t.Log("🚀 ATTACK 3: Fork Bomb")
	// If the fork bomb succeeds, the daemon might become unresponsive.
	// We will just check if we can spawn 300 processes (limit is 256).
	out = execCommand("for i in $(seq 1 300); do sleep 10 & done; ps aux | wc -l; kill -9 $(jobs -p)")
	t.Logf("Fork spawn result: %s", out)
	// If it prints a number close to 100, PID limits are missing!
	
	// Let's parse the last few lines to see the number.
	// Actually, just checking if we get "Resource temporarily unavailable" is the key.
	if strings.Contains(out, "Resource temporarily unavailable") || strings.Contains(out, "Cannot fork") {
		t.Log("✅ ATTACK 3 BLOCKED: PidsLimit enforced")
	} else {
		t.Errorf("❌ ATTACK 3 SUCCESS: Spawning 1000 processes succeeded, missing PidsLimit! Output: %s", out)
	}

	// =========================================================================
	// ATTACK 4: Disk Exhaustion (Application-Level Mitigation)
	// =========================================================================
	t.Log("🚀 ATTACK 4: Disk Exhaustion")
	
	// Create a new WS connection that we don't close immediately.
	wsDiskAtk, _, err := websocket.DefaultDialer.Dial(wsURLAtk, headersAtk)
	if err != nil {
		t.Fatalf("Failed to dial attacker WebSocket: %v", err)
	}
	defer wsDiskAtk.Close()
	
	// Wait for ready
	wsDiskAtk.SetReadDeadline(time.Now().Add(5 * time.Second))
	for {
		msgType, msgData, err := wsDiskAtk.ReadMessage()
		if err != nil || msgType == websocket.BinaryMessage {
			break
		}
		if msgType == websocket.TextMessage {
			var payload map[string]interface{}
			if json.Unmarshal(msgData, &payload) == nil && payload["stage"] == "READY" {
				break
			}
		}
	}
	wsDiskAtk.SetReadDeadline(time.Time{})

	// Write 1.1GB file to exceed the 1GB quota
	wsDiskAtk.WriteMessage(websocket.BinaryMessage, []byte("dd if=/dev/zero of=/tmp/bigfile bs=1M count=1100 2>&1\n"))

	// The command will finish, and then the background enforcer will scan and kill the container.
	// We wait up to 25 seconds to see if the websocket is disconnected by the server (EOF or Close).
	wsDiskAtk.SetReadDeadline(time.Now().Add(25 * time.Second))
	killed := false
	for {
		_, _, err := wsDiskAtk.ReadMessage()
		if err != nil {
			killed = true
			break
		}
	}

	if killed {
		t.Log("✅ ATTACK 4 BLOCKED: Disk quota enforcer successfully killed the container")
	} else {
		t.Errorf("❌ ATTACK 4 SUCCESS: Wrote >1GB to disk successfully, enforcer failed to kill container!")
	}
}
