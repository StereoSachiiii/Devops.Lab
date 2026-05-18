package messaging

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
)

// ── Inbound Job Types (consumed from RabbitMQ) ────────────────────────────────

// SessionStartedJob is published by the challenge-service when a user opens a lab.
type SessionStartedJob struct {
	SessionID   string `json:"sessionId"`
	UserID      string `json:"userId"`
	ChallengeID string `json:"challengeId"`
	Image       string `json:"image"`    // Docker image for the challenge environment
	TTLMins     int    `json:"ttlMins"`  // session lifetime in minutes
}

// SessionEndedJob is published by the challenge-service when a user leaves or times out.
type SessionEndedJob struct {
	SessionID string `json:"sessionId"`
	Reason    string `json:"reason"` // "user_left" | "timeout" | "completed"
}

// jobType is used to discriminate the message body before unmarshalling.
type jobType struct {
	Type string `json:"type"`
}

// ── Consumer ─────────────────────────────────────────────────────────────────

// SessionConsumer manages the RabbitMQ connection for session lifecycle events.
type SessionConsumer struct {
	url     string
	queue   string
	conn    *amqp.Connection
	channel *amqp.Channel
	log     *slog.Logger
}

// NewSessionConsumer creates a consumer. Call Connect() before Consume().
func NewSessionConsumer(url, queue string, log *slog.Logger) *SessionConsumer {
	return &SessionConsumer{url: url, queue: queue, log: log}
}

// Connect establishes the AMQP connection and declares the queue.
func (c *SessionConsumer) Connect() error {
	conn, err := amqp.Dial(c.url)
	if err != nil {
		return fmt.Errorf("rabbitmq: dial failed: %w", err)
	}

	ch, err := conn.Channel()
	if err != nil {
		conn.Close()
		return fmt.Errorf("rabbitmq: channel open failed: %w", err)
	}

	_, err = ch.QueueDeclare(c.queue, true, false, false, false, nil)
	if err != nil {
		ch.Close()
		conn.Close()
		return fmt.Errorf("rabbitmq: queue declare failed: %w", err)
	}

	// Allow up to 5 concurrent session lifecycle events
	// (these are cheap — just container start/stop, not execution)
	if err := ch.Qos(5, 0, false); err != nil {
		ch.Close()
		conn.Close()
		return fmt.Errorf("rabbitmq: qos set failed: %w", err)
	}

	c.conn = conn
	c.channel = ch
	c.log.Info("🐇 RabbitMQ connected", "queue", c.queue)
	return nil
}

// Handlers bundles the callbacks for each event type.
type Handlers struct {
	OnSessionStarted func(ctx context.Context, job SessionStartedJob) error
	OnSessionEnded   func(ctx context.Context, job SessionEndedJob) error
}

// Consume starts the consumer loop. Blocks until ctx is cancelled.
func (c *SessionConsumer) Consume(ctx context.Context, h Handlers) error {
	msgs, err := c.channel.Consume(c.queue, "", false, false, false, false, nil)
	if err != nil {
		return fmt.Errorf("rabbitmq: consume failed: %w", err)
	}

	c.log.Info("👷 Waiting for session events...")

	for {
		select {
		case <-ctx.Done():
			c.log.Info("Session consumer shutting down")
			return nil

		case msg, ok := <-msgs:
			if !ok {
				return fmt.Errorf("rabbitmq: delivery channel closed")
			}

			// Peek at the type field to route to the right handler
			var t jobType
			if err := json.Unmarshal(msg.Body, &t); err != nil {
				c.log.Error("Could not parse message type — discarding", "body", string(msg.Body))
				_ = msg.Nack(false, false)
				continue
			}

			jobCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
			var handlerErr error

			switch t.Type {
			case "session.started":
				var job SessionStartedJob
				if err := json.Unmarshal(msg.Body, &job); err != nil {
					c.log.Error("Failed to parse SessionStartedJob", "error", err)
					cancel()
					_ = msg.Nack(false, false)
					continue
				}
				handlerErr = h.OnSessionStarted(jobCtx, job)

			case "session.ended":
				var job SessionEndedJob
				if err := json.Unmarshal(msg.Body, &job); err != nil {
					c.log.Error("Failed to parse SessionEndedJob", "error", err)
					cancel()
					_ = msg.Nack(false, false)
					continue
				}
				handlerErr = h.OnSessionEnded(jobCtx, job)

			default:
				c.log.Warn("Unknown message type — discarding", "type", t.Type)
				cancel()
				_ = msg.Nack(false, false)
				continue
			}

			cancel()

			if handlerErr != nil {
				c.log.Error("Handler failed — nack with requeue", "type", t.Type, "error", handlerErr)
				_ = msg.Nack(false, true)
			} else {
				_ = msg.Ack(false)
			}
		}
	}
}

// Close shuts down the channel and connection.
func (c *SessionConsumer) Close() {
	if c.channel != nil {
		_ = c.channel.Close()
	}
	if c.conn != nil {
		_ = c.conn.Close()
	}
	c.log.Info("RabbitMQ connection closed")
}
