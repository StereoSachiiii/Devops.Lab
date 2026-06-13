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
		AllowAutoTopicCreation: true,
		WriteTimeout:           10 * time.Second,
		ReadTimeout:            10 * time.Second,
		Logger: kafka.LoggerFunc(func(msg string, args ...interface{}) {
			log.Debug(fmt.Sprintf(msg, args...))
		}),
	}

	log.Info("Kafka producer initialized", "brokers", brokers)
	return &KafkaProducer{writer: writer, log: log}
}

// EmitResult publishes a ChallengeResultEvent wrapped in the standard envelope to the appropriate topic.
func (k *KafkaProducer) EmitResult(ctx context.Context, topic string, event ChallengeResultEvent) error {
	timestamp := time.Now().UTC().Format(time.RFC3339)
	version := "1.0.0"
	correlationID := event.CorrelationID
	if correlationID == "" {
		correlationID = event.SubmissionID
	}

	// Inner payload matching the TS Event Payload
	payloadStruct := struct {
		SubmissionID string `json:"submissionId"`
		ChallengeID  string `json:"challengeId"`
		UserID       string `json:"userId"`
		Passed       bool   `json:"passed"`
		Stdout       string `json:"stdout"`
		Stderr       string `json:"stderr"`
		ExitCode     int    `json:"exitCode"`
		DurationMs   int64  `json:"durationMs"`
	}{
		SubmissionID: event.SubmissionID,
		ChallengeID:  event.ChallengeID,
		UserID:       event.UserID,
		Passed:       event.Passed,
		Stdout:       event.Stdout,
		Stderr:       event.Stderr,
		ExitCode:     event.ExitCode,
		DurationMs:   event.DurationMs,
	}

	// Standard envelope wrapper
	envelope := struct {
		Topic         string      `json:"topic"`
		Version       string      `json:"version"`
		Timestamp     string      `json:"timestamp"`
		CorrelationID string      `json:"correlationId"`
		Payload       interface{} `json:"payload"`
	}{
		Topic:         topic,
		Version:       version,
		Timestamp:     timestamp,
		CorrelationID: correlationID,
		Payload:       payloadStruct,
	}

	payload, err := json.Marshal(envelope)
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

	k.log.Info("Event published to Kafka",
		"topic", topic,
		"submissionId", event.SubmissionID,
		"passed", event.Passed,
	)
	return nil
}

// EmitDLQ publishes a raw unparseable or failed message directly to the DLQ topic.
func (k *KafkaProducer) EmitDLQ(ctx context.Context, originalTopic string, key, value []byte) error {
	dlqTopic := originalTopic + ".dlq"
	msg := kafka.Message{
		Topic: dlqTopic,
		Key:   key,
		Value: value,
	}

	if err := k.writer.WriteMessages(ctx, msg); err != nil {
		return fmt.Errorf("kafka: write to DLQ %s failed: %w", dlqTopic, err)
	}

	k.log.Warn("Failed message routed to DLQ", "dlq_topic", dlqTopic)
	return nil
}

// Close shuts down the Kafka writer.
func (k *KafkaProducer) Close() error {
	return k.writer.Close()
}
