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

// jobType is used to discriminate the message body before unmarshalling.
type jobType struct {
	Type string `json:"type"`
}

// ── Consumer ─────────────────────────────────────────────────────────────────

// SessionConsumer manages the RabbitMQ connection for session lifecycle events.
type SessionConsumer struct {
	url     string
	queues  []string
	conn    *amqp.Connection
	channel *amqp.Channel
	log     *slog.Logger
}

// NewSessionConsumer creates a consumer. Call Connect() before Consume().
func NewSessionConsumer(url string, queues []string, log *slog.Logger) *SessionConsumer {
	return &SessionConsumer{url: url, queues: queues, log: log}
}

// Connect establishes the AMQP connection and declares the queues.
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

	for _, queue := range c.queues {
		// Ensure DLQ exchange and queue are created (matching TypeScript DLQ semantics)
		dlx := queue + ".dlx"
		dlq := queue + ".dlq"

		err = ch.ExchangeDeclare(dlx, "direct", true, false, false, false, nil)
		if err != nil {
			return fmt.Errorf("rabbitmq: exchange declare %s failed: %w", dlx, err)
		}

		_, err = ch.QueueDeclare(dlq, true, false, false, false, nil)
		if err != nil {
			return fmt.Errorf("rabbitmq: queue declare %s failed: %w", dlq, err)
		}

		err = ch.QueueBind(dlq, queue, dlx, false, nil)
		if err != nil {
			return fmt.Errorf("rabbitmq: queue bind %s failed: %w", dlq, err)
		}

		_, err = ch.QueueDeclare(queue, true, false, false, false, amqp.Table{
			"x-dead-letter-exchange":    dlx,
			"x-dead-letter-routing-key": queue,
		})
		if err != nil {
			ch.Close()
			conn.Close()
			return fmt.Errorf("rabbitmq: queue declare %s failed: %w", queue, err)
		}
	}

	// Prefetch = 1 prevents head-of-line blocking for slow VM provisioning!
	if err := ch.Qos(1, 0, false); err != nil {
		ch.Close()
		conn.Close()
		return fmt.Errorf("rabbitmq: qos set failed: %w", err)
	}

	c.conn = conn
	c.channel = ch
	c.log.Info("🐇 RabbitMQ connected", "queues", c.queues)
	return nil
}

// Handlers bundles the callbacks for each event type.
type Handlers struct {
	OnSessionStarted func(ctx context.Context, job SessionStartedJob) error
	OnSessionEnded   func(ctx context.Context, job SessionEndedJob) error
}

// Consume starts the consumer loop. Blocks until ctx is cancelled.
func (c *SessionConsumer) Consume(ctx context.Context, h Handlers) error {
	msgCh := make(chan amqp.Delivery)

	for _, queue := range c.queues {
		msgs, err := c.channel.Consume(queue, "", false, false, false, false, nil)
		if err != nil {
			return fmt.Errorf("rabbitmq: consume %s failed: %w", queue, err)
		}
		go func(m <-chan amqp.Delivery) {
			for d := range m {
				msgCh <- d
			}
		}(msgs)
	}

	c.log.Info("👷 Waiting for session jobs from RabbitMQ...")

	for {
		select {
		case <-ctx.Done():
			c.log.Info("Session consumer shutting down")
			return nil

		case msg := <-msgCh:
			// Peek at the type field to route to the right handler
			var t jobType
			if err := json.Unmarshal(msg.Body, &t); err != nil {
				c.log.Error("Could not parse message type — discarding to DLQ", "body", string(msg.Body))
				_ = msg.Nack(false, false)
				continue
			}

			// Sandbox tasks can take a while (e.g., Flintlock), but we don't want them hanging forever
			jobCtx, cancel := context.WithTimeout(ctx, 5*time.Minute)
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
				c.log.Warn("Unknown message type — discarding to DLQ", "type", t.Type)
				cancel()
				_ = msg.Nack(false, false)
				continue
			}

			cancel()

			if handlerErr != nil {
				c.log.Error("Handler failed — sending to DLQ", "type", t.Type, "error", handlerErr)
				_ = msg.Nack(false, false) // send to DLQ
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
