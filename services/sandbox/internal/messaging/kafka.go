package messaging

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/segmentio/kafka-go"
)

const (
	TopicSessionStarted = "sandbox.session.started"
	TopicSessionEnded   = "sandbox.session.ended"
)

// SessionStartedJob is published when a user opens a lab.
type SessionStartedJob struct {
	SessionID   string `json:"sessionId"`
	UserID      string `json:"userId"`
	ChallengeID string `json:"challengeId"`
	Image       string `json:"image"`
	TTLMins     int    `json:"ttlMins"`
}

// SessionEndedJob is published when a user leaves or times out.
type SessionEndedJob struct {
	SessionID string `json:"sessionId"`
	Reason    string `json:"reason"`
}

// kafkaSessionEvent wraps the standard envelope.
type kafkaSessionEvent struct {
	Topic         string          `json:"topic"`
	Version       string          `json:"version"`
	Timestamp     string          `json:"timestamp"`
	CorrelationID string          `json:"correlationId"`
	Payload       json.RawMessage `json:"payload"`
}

// SessionHandlers bundles the callbacks for each event type.
type SessionHandlers struct {
	OnSessionStarted func(ctx context.Context, job SessionStartedJob) error
	OnSessionEnded   func(ctx context.Context, job SessionEndedJob) error
}

// KafkaSessionConsumer consumes session lifecycle events from Kafka.
// kafka-go ReaderConfig only supports a single topic, so we run one reader per topic.
type KafkaSessionConsumer struct {
	readers  []*kafka.Reader
	producer *KafkaProducer
	log      *slog.Logger
}

// NewKafkaSessionConsumer creates consumers for both session topics using the same consumer group.
func NewKafkaSessionConsumer(brokers, groupID string, producer *KafkaProducer, log *slog.Logger) *KafkaSessionConsumer {
	brokerList := strings.Split(brokers, ",")

	logger := kafka.LoggerFunc(func(msg string, args ...interface{}) {
		log.Debug(fmt.Sprintf(msg, args...))
	})

	startedReader := kafka.NewReader(kafka.ReaderConfig{
		Brokers: brokerList,
		GroupID: groupID,
		Topic:   TopicSessionStarted,
		Logger:  logger,
	})

	endedReader := kafka.NewReader(kafka.ReaderConfig{
		Brokers: brokerList,
		GroupID: groupID,
		Topic:   TopicSessionEnded,
		Logger:  logger,
	})

	return &KafkaSessionConsumer{
		readers:  []*kafka.Reader{startedReader, endedReader},
		producer: producer,
		log:      log,
	}
}

// Consume starts consumer loops for both topics. Blocks until ctx is cancelled.
func (c *KafkaSessionConsumer) Consume(ctx context.Context, h SessionHandlers) error {
	c.log.Info("Kafka session consumer started",
		"topics", fmt.Sprintf("%s, %s", TopicSessionStarted, TopicSessionEnded))

	var wg sync.WaitGroup
	errCh := make(chan error, len(c.readers))

	for _, r := range c.readers {
		wg.Add(1)
		go func(reader *kafka.Reader) {
			defer wg.Done()
			if err := c.consumeLoop(ctx, reader, h); err != nil {
				errCh <- err
			}
		}(r)
	}

	wg.Wait()
	close(errCh)

	for err := range errCh {
		if err != nil {
			return err
		}
	}
	return nil
}

func (c *KafkaSessionConsumer) consumeLoop(ctx context.Context, reader *kafka.Reader, h SessionHandlers) error {
	topic := reader.Config().Topic
	for {
		msg, err := reader.FetchMessage(ctx)
		if err != nil {
			if ctx.Err() != nil {
				c.log.Info("Session consumer shutting down", "topic", topic)
				return nil
			}
			return fmt.Errorf("kafka: fetch failed on %s: %w", topic, err)
		}

		var wrapper kafkaSessionEvent
		if err := json.Unmarshal(msg.Value, &wrapper); err != nil {
			c.log.Error("Could not parse session event — skipping", "error", err, "topic", msg.Topic)
			if c.producer != nil {
				_ = c.producer.EmitDLQ(ctx, topic, msg.Key, msg.Value)
			}
			_ = reader.CommitMessages(ctx, msg)
			continue
		}

		maxRetries := 3
		success := false
		backoff := time.Second

		for attempt := 1; attempt <= maxRetries; attempt++ {
			var handlerErr error
			switch topic {
			case TopicSessionStarted:
				var job SessionStartedJob
				if err := json.Unmarshal(wrapper.Payload, &job); err != nil {
					handlerErr = fmt.Errorf("parse SessionStartedJob: %w", err)
				} else {
					handlerErr = h.OnSessionStarted(ctx, job)
				}

			case TopicSessionEnded:
				var job SessionEndedJob
				if err := json.Unmarshal(wrapper.Payload, &job); err != nil {
					handlerErr = fmt.Errorf("parse SessionEndedJob: %w", err)
				} else {
					handlerErr = h.OnSessionEnded(ctx, job)
				}

			default:
				c.log.Warn("Unknown session event topic", "topic", topic)
				success = true // Just skip it
			}

			if handlerErr == nil {
				success = true
				break
			}

			c.log.Error("Handler failed", "topic", topic, "attempt", attempt, "max", maxRetries, "error", handlerErr)
			
			if attempt < maxRetries {
				select {
				case <-ctx.Done():
					return nil
				case <-time.After(backoff):
				}
				backoff *= 2
				if backoff > 30*time.Second {
					backoff = 30 * time.Second
				}
			}
		}

		if !success {
			c.log.Warn("Message failed after max retries, routing to DLQ", "topic", topic)
			if c.producer != nil {
				if err := c.producer.EmitDLQ(ctx, topic, msg.Key, msg.Value); err != nil {
					c.log.Error("CRITICAL: Failed to publish to DLQ, skipping commit to retry later", "error", err)
					continue // Loop without committing, forcing a retry on the DLQ publish later
				}
			}
		}

		_ = reader.CommitMessages(ctx, msg)
	}
}

// Close shuts down all Kafka readers.
func (c *KafkaSessionConsumer) Close() error {
	for _, r := range c.readers {
		if err := r.Close(); err != nil {
			return err
		}
	}
	return nil
}
