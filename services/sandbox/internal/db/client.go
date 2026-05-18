package db

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"

	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq" // postgres driver
)

// SubmissionStatus mirrors the Prisma SubmissionStatus enum in schema.prisma
type SubmissionStatus string

const (
	StatusPending   SubmissionStatus = "PENDING"
	StatusRunning   SubmissionStatus = "RUNNING"
	StatusCompleted SubmissionStatus = "COMPLETED"
	StatusFailed    SubmissionStatus = "FAILED"
)

// Client wraps a sqlx.DB connection for Submission-specific queries.
type Client struct {
	db  *sqlx.DB
	log *slog.Logger
}

// NewClient opens a Postgres connection using the provided DATABASE_URL.
func NewClient(databaseURL string, log *slog.Logger) (*Client, error) {
	db, err := sqlx.Connect("postgres", databaseURL)
	if err != nil {
		return nil, fmt.Errorf("db: connect failed: %w", err)
	}

	// Conservative pool settings for a single worker
	db.SetMaxOpenConns(5)
	db.SetMaxIdleConns(2)

	log.Info("🐘 Postgres connected")
	return &Client{db: db, log: log}, nil
}

// UpdateSubmissionStatus updates the status and optional result JSON of a Submission row.
// result can be nil (e.g., when transitioning to RUNNING).
func (c *Client) UpdateSubmissionStatus(ctx context.Context, submissionID string, status SubmissionStatus, result map[string]any) error {
	if result == nil {
		_, err := c.db.ExecContext(ctx,
			`UPDATE "Submission" SET status = $1 WHERE id = $2`,
			string(status), submissionID,
		)
		if err != nil {
			return fmt.Errorf("db: update status failed: %w", err)
		}
		return nil
	}

	resultJSON, err := json.Marshal(result)
	if err != nil {
		return fmt.Errorf("db: marshal result failed: %w", err)
	}

	_, err = c.db.ExecContext(ctx,
		`UPDATE "Submission" SET status = $1, result = $2 WHERE id = $3`,
		string(status), resultJSON, submissionID,
	)
	if err != nil {
		return fmt.Errorf("db: update status+result failed: %w", err)
	}

	c.log.Debug("Submission status updated",
		"submissionId", submissionID,
		"status", status,
	)
	return nil
}

// Close releases the database connection pool.
func (c *Client) Close() error {
	return c.db.Close()
}
