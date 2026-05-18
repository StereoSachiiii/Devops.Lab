package terminal

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// Message types sent over the WebSocket (text frames = JSON control, binary frames = raw PTY bytes)
const (
	msgTypeResize = "resize"
	msgTypePing   = "ping"
)

// ResizeMessage is sent by the browser when the terminal window is resized.
type ResizeMessage struct {
	Type string `json:"type"`
	Cols uint   `json:"cols"`
	Rows uint   `json:"rows"`
}

// Pipe bridges a WebSocket connection to a Docker PTY (io.ReadWriteCloser).
// Binary WebSocket frames → PTY stdin.
// PTY stdout → Binary WebSocket frames.
// JSON text frames → control messages (resize, ping).
// Blocks until either side closes.
func Pipe(ctx context.Context, ws *websocket.Conn, pty io.ReadWriteCloser, resizeFn func(cols, rows uint) error, log *slog.Logger) {
	defer pty.Close()

	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	var wg sync.WaitGroup
	wg.Add(2)

	// PTY → WebSocket: read terminal output and send to browser
	go func() {
		defer wg.Done()
		defer cancel() // if PTY closes, stop the other direction too

		buf := make([]byte, 4096)
		for {
			n, err := pty.Read(buf)
			if n > 0 {
				if writeErr := ws.WriteMessage(websocket.BinaryMessage, buf[:n]); writeErr != nil {
					log.Debug("WebSocket write failed (client disconnected?)", "error", writeErr)
					return
				}
			}
			if err != nil {
				if err != io.EOF {
					log.Debug("PTY read closed", "error", err)
				}
				return
			}
		}
	}()

	// WebSocket → PTY: read browser input and write to terminal
	go func() {
		defer wg.Done()
		defer cancel()

		ws.SetReadDeadline(time.Time{}) // no timeout — user can be idle

		for {
			msgType, data, err := ws.ReadMessage()
			if err != nil {
				log.Debug("WebSocket read closed", "error", err)
				return
			}

			switch msgType {
			case websocket.BinaryMessage:
				// Raw keystrokes — write directly to PTY stdin
				if _, err := pty.Write(data); err != nil {
					log.Debug("PTY write failed", "error", err)
					return
				}

			case websocket.TextMessage:
				// JSON control message (resize, ping)
				var msg ResizeMessage
				if err := json.Unmarshal(data, &msg); err != nil {
					log.Warn("Unknown text message from client", "data", string(data))
					continue
				}
				switch msg.Type {
				case msgTypeResize:
					if resizeFn != nil {
						if err := resizeFn(msg.Cols, msg.Rows); err != nil {
							log.Warn("PTY resize failed", "error", err)
						}
					}
				case msgTypePing:
					// keep-alive — no-op on server side
				}
			}

			// Check if ctx was cancelled (e.g. session TTL expired)
			select {
			case <-ctx.Done():
				return
			default:
			}
		}
	}()

	// Wait for both directions to close
	wg.Wait()
	log.Debug("Terminal pipe closed")
}
