package messaging

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/segmentio/kafka-go"
)

const (
	TopicChallengeSolved = "curriculum.challenge.solved"
	TopicChallengeFailed = "curriculum.challenge.failed"
)

// ChallengeResultEvent is published to Kafka after sandbox execution completes.
// Consumed by: progress-service, notification-service, leaderboard.
type ChallengeResultEvent struct {
	SubmissionID  string `json:"submissionId"`
	ChallengeID   string `json:"challengeId"`
	UserID        string `json:"userId"`
	Passed        bool   `json:"passed"`
	Stdout        string `json:"stdout"`
	Stderr        string `json:"stderr"`
	ExitCode      int    `json:"exitCode"`
	DurationMs    int64  `json:"durationMs"`
	Timestamp     string `json:"timestamp"`
	CorrelationID string `json:"correlationId"`
	Version       string `json:"version"`
}

// KafkaProducer wraps kafka-go writer for publishing challenge result events.
type KafkaProducer struct {
	writer *kafka.Writer
	log    *slog.Logger
}

// NewKafkaProducer creates and connects a Kafka producer.
func NewKafkaProducer(brokers, clientID string, log *slog.Logger) *KafkaProducer {
	brokerList := strings.Split(brokers, ",")

	writer := &kafka.Writer{
		Addr:                   kafka.TCP(brokerList...),
		Balancer:               &kafka.LeastBytes{},
		AllowAutoTopicCreation: true, // fine for dev; disable in production with managed Kafka
		WriteTimeout:           10 * time.Second,
		ReadTimeout:            10 * time.Second,
		Logger:                 kafka.LoggerFunc(func(msg string, args ...interface{}) {
			log.Debug(fmt.Sprintf(msg, args...))
		}),
	}

	log.Info("📨 Kafka producer initialized", "brokers", brokers)
	return &KafkaProducer{writer: writer, log: log}
}

// EmitResult publishes a ChallengeResultEvent to the appropriate topic.
// topic is either TopicChallengeSolved or TopicChallengeFailed.
func (k *KafkaProducer) EmitResult(ctx context.Context, topic string, event ChallengeResultEvent) error {
	event.Timestamp = time.Now().UTC().Format(time.RFC3339)
	event.Version = "1.0.0"
	if event.CorrelationID == "" {
		event.CorrelationID = event.SubmissionID // use submissionId as correlation key
	}

	payload, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("kafka: marshal failed: %w", err)
	}

	msg := kafka.Message{
		Topic: topic,
		Key:   []byte(event.SubmissionID),
		Value: payload,
	}

	if err := k.writer.WriteMessages(ctx, msg); err != nil {
		return fmt.Errorf("kafka: write to %s failed: %w", topic, err)
	}

	k.log.Info("📤 Event published to Kafka",
		"topic", topic,
		"submissionId", event.SubmissionID,
		"passed", event.Passed,
	)
	return nil
}

// Close shuts down the Kafka writer.
func (k *KafkaProducer) Close() error {
	return k.writer.Close()
}
