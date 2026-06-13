package config

import (
	"crypto/rsa"
	"encoding/base64"
	"fmt"
	"os"
	"strconv"
	"strings"

	"github.com/golang-jwt/jwt/v5"
	"github.com/joho/godotenv"
)

type Config struct {
	HTTPPort string

	// Kafka — session commands (consumer) and challenge results (producer)
	KafkaBrokers  string
	KafkaClientID string
	KafkaGroupID  string

	// Redis — session store (sessionID → containerID)
	RedisURL string

	RabbitMQURL string

	// Postgres — update Submission status
	DatabaseURL string

	// JWT — validate browser connections to /sessions/:id/terminal
	JWTPublicKey *rsa.PublicKey

	// Session limits
	SessionTTLMins int

	// Docker sandbox resource limits
	MaxMemoryMB int
	MaxCPUs     float64
	NetworkMode string
	EncryptionKey []byte

	// Provider selection
	SandboxProvider  string
	FlintlockAddress string

	// HTTP / WebSocket
	AllowedOrigins string // comma-separated list of allowed CORS origins
}

func Load() (*Config, error) {
	_ = godotenv.Load()
	keyStr := getEnv("ENCRYPTION_KEY", "")

	cfg := &Config{
		HTTPPort:       getEnv("HTTP_PORT",""),
		KafkaBrokers:   getEnv("KAFKA_BROKERS",""),
		KafkaClientID:  getEnv("KAFKA_CLIENT_ID", ""),
		KafkaGroupID:   getEnv("KAFKA_GROUP_ID", ""),
		RedisURL:       getEnv("REDIS_URL", ""),
		RabbitMQURL:    getEnv("RABBITMQ_URL", "amqp://localhost:5672"),
		DatabaseURL:    getEnv("DATABASE_URL", ""),
		SessionTTLMins: getEnvInt("SESSION_TTL_MINS", 60),
		MaxMemoryMB:    getEnvInt("MAX_MEMORY_MB", 512),
		MaxCPUs:        getEnvFloat("MAX_CPUS", 1.0),
		NetworkMode:    getEnv("DOCKER_NETWORK_MODE", "none"),
		SandboxProvider:  getEnv("SANDBOX_PROVIDER", "docker"),
		FlintlockAddress: getEnv("FLINTLOCK_ADDRESS", "localhost:9090"),
		AllowedOrigins:   getEnv("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:5173"),
	}
	if cfg.RedisURL == "" {
		return nil, fmt.Errorf("REDIS_URL is required")
	}

	if cfg.KafkaBrokers == "" {
		return nil, fmt.Errorf("KAFKA_BROKERS ENV VAR is missing")
	}

	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}
	if getEnv("JWT_PUBLIC_KEY", "") == "" {
		return nil, fmt.Errorf("JWT_PUBLIC_KEY is required")
	}

	// The env var might contain literal \n characters if passed directly in docker-compose
	pemStr := strings.ReplaceAll(getEnv("JWT_PUBLIC_KEY", ""), "\\n", "\n")
	pubKey, err := jwt.ParseRSAPublicKeyFromPEM([]byte(pemStr))
	if err != nil {
		return nil, fmt.Errorf("failed to parse JWT_PUBLIC_KEY: %w", err)
	}
	cfg.JWTPublicKey = pubKey
	if keyStr == "" {
    		return nil, fmt.Errorf("ENCRYPTION_KEY is required")
	}
	
	key, err := base64.StdEncoding.DecodeString(keyStr)
	if err != nil {
    		return nil, fmt.Errorf("config: invalid ENCRYPTION_KEY: %w", err)
	}
	if len(key) != 32 {
    		return nil, fmt.Errorf("config: ENCRYPTION_KEY must decode to 32 bytes, got %d", len(key))
	}
	cfg.EncryptionKey = key
	return cfg, nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}

func getEnvFloat(key string, fallback float64) float64 {
	if v := os.Getenv(key); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil {
			return f
		}
	}
	return fallback
}
