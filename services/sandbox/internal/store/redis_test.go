package store

import (
	"context"
	"log/slog"
	"os"
	"testing"
)

func setupTestRedis(t *testing.T) *RedisStore {
	t.Helper()
	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		redisURL = "redis://localhost:6379/0"
	}
	encryptionKey := "0123456789abcdef0123456789abcdef" // 32 bytes for AES-256
	log := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelError}))
	r, err := NewRedisStore(redisURL, 60, log, []byte(encryptionKey))
	if err != nil {
		t.Skipf("Skipping test, Redis not available at %s: %v", redisURL, err)
	}
	return r
}

func TestRedisStore_IsDenylisted(t *testing.T) {
	r := setupTestRedis(t)
	defer r.Close()

	ctx := context.Background()

	t.Run("Key exists in Redis (denylisted)", func(t *testing.T) {
		jti := "test-jti-exists"
		// Manually set the key to "revoked"
		err := r.client.Set(ctx, "auth:denylist:jti:"+jti, "revoked", 0).Err()
		if err != nil {
			t.Fatalf("failed to setup test data: %v", err)
		}
		defer r.client.Del(ctx, "auth:denylist:jti:"+jti)

		denylisted, err := r.IsDenylisted(ctx, jti)
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
		if !denylisted {
			t.Errorf("expected denylisted=true, got false")
		}
	})

	t.Run("Key does not exist", func(t *testing.T) {
		jti := "test-jti-missing"
		denylisted, err := r.IsDenylisted(ctx, jti)
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
		if denylisted {
			t.Errorf("expected denylisted=false, got true")
		}
	})

	t.Run("Genuine error", func(t *testing.T) {
		jti := "test-jti-error"
		
		// Create a separate instance so we can close it to simulate connection error
		rErr := setupTestRedis(t)
		rErr.Close() // This will cause subsequent commands to fail with "redis: client is closed"
		
		denylisted, err := rErr.IsDenylisted(ctx, jti)
		if err == nil {
			t.Fatalf("expected error, got nil")
		}
		if denylisted {
			t.Errorf("expected denylisted=false, got true")
		}
	})
}
