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

func TestMultipleTabs_Integration(t *testing.T) {
	if os.Getenv("TEST_INTEGRATION") != "1" {
		t.Skip("Skipping integration test (TEST_INTEGRATION not set)")
	}

	email := fmt.Sprintf("multitab_%d@example.com", time.Now().UnixNano())

	// 1. Register and Login a User
	_, token := registerAndLoginUser(t, email, "TestPassword123!")
	if token == "" {
		t.Fatalf("Failed to get token")
	}

	// 1.5 Fetch challenges to get a valid ID
	chalReq, _ := http.NewRequest("GET", getCoreURL()+"/challenges", nil)
	chalReq.Header.Set("Authorization", "Bearer "+token)
	chalResp, err := (&http.Client{}).Do(chalReq)
	if err != nil {
		t.Fatalf("Failed to fetch challenges: %v", err)
	}
	defer chalResp.Body.Close()
	var challenges []map[string]interface{}
	json.NewDecoder(chalResp.Body).Decode(&challenges)
	if len(challenges) == 0 {
		t.Fatalf("No challenges found")
	}
	challengeID := challenges[0]["id"].(string)

	// 2. Start a sandbox session
	req, _ := http.NewRequest("POST", getCoreURL()+"/challenges/"+challengeID+"/start", nil)
	req.Header.Set("Authorization", "Bearer "+token)

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("Failed to start session: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("Start session failed: %d %s", resp.StatusCode, string(body))
	}

	var startData StartSessionResponse
	if err := json.NewDecoder(resp.Body).Decode(&startData); err != nil {
		t.Fatalf("Failed to decode session response: %v", err)
	}
	sessionID := startData.SessionID
	t.Logf("✅ Session started: %s", sessionID)

	if err := waitForHealthySession(t, sessionID, token); err != nil {
		t.Fatalf("Failed waiting for session to become healthy: %v", err)
	}

	// Build WebSocket URL
	wsBaseURL := strings.Replace(getSandboxURL(), "http://", "ws://", 1)
	wsURL := fmt.Sprintf("%s/sessions/%s/terminal", wsBaseURL, sessionID)
	headers := http.Header{}
	headers.Add("Authorization", "Bearer "+token)
	headers.Add("Origin", "http://localhost:3000")

	// Helper to connect and wait for ready
	connectAndReady := func(name string) (*websocket.Conn, error) {
		ws, _, err := websocket.DefaultDialer.Dial(wsURL, headers)
		if err != nil {
			return nil, fmt.Errorf("failed to dial: %w", err)
		}
		
		for {
			ws.SetReadDeadline(time.Now().Add(15 * time.Second))
			msgType, msgData, err := ws.ReadMessage()
			if err != nil {
				ws.Close()
				return nil, fmt.Errorf("read error while waiting for ready: %w", err)
			}
			
			if msgType == websocket.TextMessage {
				var payload map[string]interface{}
				if err := json.Unmarshal(msgData, &payload); err == nil && payload["stage"] == "READY" {
					t.Logf("✅ %s connected and received READY event", name)
					if name == "Tab B" {
						// Tab B won't receive the prompt binary message because it's already printed,
						// so we can stop waiting here.
						ws.SetReadDeadline(time.Time{})
						return ws, nil
					}
					continue
				}
			} else if msgType == websocket.BinaryMessage {
				t.Logf("✅ %s connected and received initial PTY output", name)
				ws.SetReadDeadline(time.Time{})
				return ws, nil
			}
		}
	}

	// Connect Tab A
	wsA, err := connectAndReady("Tab A")
	if err != nil {
		t.Fatalf("Tab A failed to connect: %v", err)
	}
	defer wsA.Close()

	// Connect Tab B
	wsB, err := connectAndReady("Tab B")
	if err != nil {
		t.Fatalf("Tab B failed to connect: %v", err)
	}
	defer wsB.Close()

	// 1. Output Streaming: Does output stream to both?
	t.Log("🚀 Testing 1: Output streaming to both tabs")

	// Note: We DO NOT clear buffers here. Gorilla websocket connections enter a fatal error state 
	// if ReadMessage times out. Instead, we use a unique string for each command and search the output.
	
	// Tab A sends a command
	uniqueStr := fmt.Sprintf("HELLO_BOTH_%d", time.Now().UnixNano())
	wsA.WriteMessage(websocket.BinaryMessage, []byte("echo " + uniqueStr + "\n"))

	// Both tabs should read it
	readOutput := func(ws *websocket.Conn, timeout time.Duration, expectedStr string) string {
		ws.SetReadDeadline(time.Now().Add(timeout))
		var out strings.Builder
		for {
			msgType, data, err := ws.ReadMessage()
			if err != nil {
				t.Logf("[%s] ReadMessage error: %v", timeout, err)
				break
			}
			t.Logf("Received msgType %d, length %d", msgType, len(data))
			if msgType == websocket.BinaryMessage {
				out.Write(data)
				t.Logf("Current output buffer: %s", out.String())
				if expectedStr != "" && strings.Contains(out.String(), expectedStr) {
					break
				}
			}
		}
		// Clear read deadline when done
		ws.SetReadDeadline(time.Time{})
		return out.String()
	}

	outA := readOutput(wsA, 2*time.Second, uniqueStr)
	outB := readOutput(wsB, 2*time.Second, uniqueStr)

	if strings.Contains(outA, uniqueStr) {
		t.Log("✅ Tab A received output successfully")
	} else {
		t.Errorf("❌ Tab A missed output")
	}

	if strings.Contains(outB, uniqueStr) {
		t.Log("✅ Tab B received output successfully")
	} else {
		t.Errorf("❌ Tab B missed output (Current state: Only one connection gets the stream?)")
	}

	// 2. Concurrent Keystrokes
	t.Log("🚀 Testing 2: Concurrent Keystrokes")
	// We will send "e" "c" "h" "o" " " "B" "A" "R" "\n" from alternating tabs very fast.
	// We want to see if the PTY handles interleaving or corrupts.
	wsA.WriteMessage(websocket.BinaryMessage, []byte("e"))
	wsB.WriteMessage(websocket.BinaryMessage, []byte("c"))
	wsA.WriteMessage(websocket.BinaryMessage, []byte("h"))
	wsB.WriteMessage(websocket.BinaryMessage, []byte("o"))
	wsA.WriteMessage(websocket.BinaryMessage, []byte(" "))
	wsB.WriteMessage(websocket.BinaryMessage, []byte("X"))
	wsA.WriteMessage(websocket.BinaryMessage, []byte("Y"))
	wsB.WriteMessage(websocket.BinaryMessage, []byte("Z"))
	// Send a marker to know when to stop reading
	marker := fmt.Sprintf("END_OF_TEST_2_%d", time.Now().UnixNano())
	wsA.WriteMessage(websocket.BinaryMessage, []byte("echo " + marker + "\n"))

	// read to flush
	readOutput(wsA, 2*time.Second, marker)
	readOutput(wsB, 2*time.Second, marker)
	
	// 3. Resize Test
	t.Log("🚀 Testing 3: Independent Resize (SIGWINCH)")
	// Tab A resizes to 80x24
	wsA.WriteMessage(websocket.TextMessage, []byte(`{"type":"resize","cols":80,"rows":24}`))
	time.Sleep(200 * time.Millisecond)
	// Tab B resizes to 120x40
	wsB.WriteMessage(websocket.TextMessage, []byte(`{"type":"resize","cols":120,"rows":40}`))
	time.Sleep(200 * time.Millisecond)

	// 4. Disconnect Behavior
	t.Log("🚀 Testing 4: Disconnect Behavior (Does closing Tab A kill Tab B?)")
	wsA.Close() // Close Tab A!
	time.Sleep(1 * time.Second) // Give the server time to process the close

	// See if Tab B still works
	uniqueStrB := fmt.Sprintf("STILL_ALIVE_%d", time.Now().UnixNano())
	wsB.WriteMessage(websocket.BinaryMessage, []byte("echo " + uniqueStrB + "\n"))
	
	outB2 := readOutput(wsB, 3*time.Second, uniqueStrB)

	if strings.Contains(outB2, uniqueStrB) {
		t.Log("✅ Tab B remained alive after Tab A disconnected")
	} else {
		t.Errorf("❌ Tab B died/stopped responding after Tab A disconnected! Disconnect behavior is BROKEN.")
	}
}
