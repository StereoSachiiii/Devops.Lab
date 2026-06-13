package store

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"github.com/redis/go-redis/v9"
	"io"
)

const keyPrefix = "session:"

// SessionData is everything the sandbox needs to know about an active session.
// Stored in Redis; containerID is the link between the session and Docker & later the firecracker vm.
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
	encryptionKey []byte



}

func encrypt(key []byte, plaintext []byte) ([]byte, error) {

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	
	gcm, err := cipher.NewGCM(block)
	if err != nil {
	 	return nil, err
	}

	nonce := make([]byte, gcm.NonceSize())   // 12 bytes number once used 
	
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
	return nil, err
	}

	ciphertext :=  gcm.Seal(nonce,  nonce, plaintext, nil)
	return ciphertext, nil


}

func decrypt(key []byte, ciphertext [] byte) ([]byte, error){

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	
	nonceSize := gcm.NonceSize()
	if len(ciphertext) < nonceSize {
		return nil, fmt.Errorf("Ciphertet too short. it should exceed the length of the nonce")
	}

	nonce, actualCipherText := ciphertext[:nonceSize], ciphertext[nonceSize:]
		
	plaintext, err := gcm.Open(nil, nonce, actualCipherText, nil)
	if err != nil {
	return nil, fmt.Errorf("Error with decryption.")
	}

	return plaintext, nil

}

// NewRedisStore connects to Redis and returns a store.
func NewRedisStore(redisURL string, ttlMins int, log *slog.Logger, encryptionKey []byte) (*RedisStore, error) {

	if l := len(encryptionKey); l != 16 && l != 24 && l != 32 {
		return nil, fmt.Errorf("crypto: invalid key size %d (must be 16, 24, or 32 bytes)", l)
	}

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

	log.Info(" Redis connected", "url", redisURL)
	return &RedisStore{
		client: client,
		ttl:    time.Duration(ttlMins) * time.Minute,
		log:    log,
		encryptionKey: encryptionKey,
	}, nil
}

// Save stores a session. TTL is set on the Redis key — it auto-expires as a safety net
// even if the reaper misses it.
func (s *RedisStore) Save(ctx context.Context, data SessionData) error {
	payload, err := json.Marshal(data)
	if err != nil {
		return fmt.Errorf("redis: marshal failed: %w", err)
	}

	encryptedPayload, err := encrypt(s.encryptionKey, payload)
	if err != nil {
		return fmt.Errorf("Encryption failed: %w", err)		
	}



	key := keyPrefix + data.SessionID
	if err := s.client.Set(ctx, key, encryptedPayload, s.ttl).Err(); err != nil {
		return fmt.Errorf("redis: set failed: %w", err)
	}

	s.log.Debug("Session saved to Redis", "sessionId", data.SessionID, "ttl", s.ttl)
	return nil
}

// Get retrieves a session by ID. Returns nil, nil if the session does not exist.
func (s *RedisStore) Get(ctx context.Context, sessionID string) (*SessionData, error) {
	key := keyPrefix + sessionID


	val, err := s.client.Get(ctx, key).Bytes()
	if err == redis.Nil {
		return nil, nil // session not found — not an error
	}
	if err != nil {
		return nil, fmt.Errorf("redis: get failed: %w", err)
	}

	decryptedPayload, err := decrypt(s.encryptionKey, val)
	if err != nil {
		return nil, fmt.Errorf("redis : decryption failed %w ", err)
	}

	var data SessionData
	if err := json.Unmarshal(decryptedPayload, &data); err != nil {
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


	//keys, err := s.client.Keys(ctx, keyPrefix+"*").Result() not this because i dont want this to block too long not really an issue but let's not block at least
	var keys []string
	var cursor uint64
	for {
    		var batch []string
    		var err error
   		batch, cursor, err = s.client.Scan(ctx, cursor, keyPrefix+"*", 100).Result()
    		if err != nil {
       			 return nil, fmt.Errorf("redis: scan failed: %w", err)
    		}
   		keys = append(keys, batch...)
    			if cursor == 0 {
       				break
    			}
	}

	sessions := make([]SessionData, 0, len(keys))
	for _, key := range keys {
		val, err := s.client.Get(ctx, key).Bytes()
		if err != nil {
			continue // key expired between KEYS and GET — skip
		}

		decryptedPayload, err := decrypt(s.encryptionKey, val)
		if err != nil {
			s.log.Error("Reaper skipped corrupted/unauthenticated session entry", "key", key, "error",  err)
			continue
		}

		var data SessionData
		if err := json.Unmarshal(decryptedPayload, &data); err != nil {
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
