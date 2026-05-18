package store

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/redis/go-redis/v9"
)

const keyPrefix = "session:"

// SessionData is everything the sandbox needs to know about an active session.
// Stored in Redis; containerID is the link between the session and Docker.
type SessionData struct {
	SessionID   string    `json:"sessionId"`
	ContainerID string    `json:"containerId"`
	UserID      string    `json:"userId"`
	ChallengeID string    `json:"challengeId"`
	Image       string    `json:"image"`
	CreatedAt   time.Time `json:"createdAt"`
}

// RedisStore manages session persistence in Redis.
type RedisStore struct {
	client *redis.Client
	ttl    time.Duration
	log    *slog.Logger
}

// NewRedisStore connects to Redis and returns a store.
func NewRedisStore(redisURL string, ttlMins int, log *slog.Logger) (*RedisStore, error) {
	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, fmt.Errorf("redis: invalid URL: %w", err)
	}

	client := redis.NewClient(opts)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := client.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("redis: ping failed: %w", err)
	}

	log.Info("🔴 Redis connected", "url", redisURL)
	return &RedisStore{
		client: client,
		ttl:    time.Duration(ttlMins) * time.Minute,
		log:    log,
	}, nil
}

// Save stores a session. TTL is set on the Redis key — it auto-expires as a safety net
// even if the reaper misses it.
func (s *RedisStore) Save(ctx context.Context, data SessionData) error {
	payload, err := json.Marshal(data)
	if err != nil {
		return fmt.Errorf("redis: marshal failed: %w", err)
	}

	key := keyPrefix + data.SessionID
	if err := s.client.Set(ctx, key, payload, s.ttl).Err(); err != nil {
		return fmt.Errorf("redis: set failed: %w", err)
	}

	s.log.Debug("Session saved to Redis", "sessionId", data.SessionID, "ttl", s.ttl)
	return nil
}

// Get retrieves a session by ID. Returns nil, nil if the session does not exist.
func (s *RedisStore) Get(ctx context.Context, sessionID string) (*SessionData, error) {
	key := keyPrefix + sessionID
	val, err := s.client.Get(ctx, key).Result()
	if err == redis.Nil {
		return nil, nil // session not found — not an error
	}
	if err != nil {
		return nil, fmt.Errorf("redis: get failed: %w", err)
	}

	var data SessionData
	if err := json.Unmarshal([]byte(val), &data); err != nil {
		return nil, fmt.Errorf("redis: unmarshal failed: %w", err)
	}

	return &data, nil
}

// Delete removes a session from Redis.
func (s *RedisStore) Delete(ctx context.Context, sessionID string) error {
	key := keyPrefix + sessionID
	if err := s.client.Del(ctx, key).Err(); err != nil {
		return fmt.Errorf("redis: delete failed: %w", err)
	}
	return nil
}

// AllSessions returns all active sessions. Used by the reaper to find expired ones.
func (s *RedisStore) AllSessions(ctx context.Context) ([]SessionData, error) {
	keys, err := s.client.Keys(ctx, keyPrefix+"*").Result()
	if err != nil {
		return nil, fmt.Errorf("redis: keys scan failed: %w", err)
	}

	sessions := make([]SessionData, 0, len(keys))
	for _, key := range keys {
		val, err := s.client.Get(ctx, key).Result()
		if err != nil {
			continue // key expired between KEYS and GET — skip
		}
		var data SessionData
		if err := json.Unmarshal([]byte(val), &data); err != nil {
			continue
		}
		sessions = append(sessions, data)
	}

	return sessions, nil
}

// Close releases the Redis connection.
func (s *RedisStore) Close() error {
	return s.client.Close()
}
