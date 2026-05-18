package config

import (
	"fmt"
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

// Config holds all environment-driven configuration for the sandbox service.
type Config struct {
	// HTTP Server (WebSocket terminal endpoint)
	HTTPPort string

	// RabbitMQ — session lifecycle events
	RabbitMQURL      string
	SessionQueue     string

	// Kafka — result events
	KafkaBrokers  string
	KafkaClientID string

	// Redis — session store (sessionID → containerID)
	RedisURL string

	// Postgres — update Submission status
	DatabaseURL string

	// JWT — validate browser connections to /sessions/:id/terminal
	JWTSecret string

	// Session limits
	SessionTTLMins int // how long a container lives before the reaper kills it

	// Docker sandbox resource limits
	MaxMemoryMB int
	MaxCPUs     float64
	NetworkMode string // "none" in production, "bridge" for local debug
}

// Load reads .env (if present) then environment variables, validates required
// fields, and returns a populated Config.
func Load() (*Config, error) {
	_ = godotenv.Load() // .env optional — prod injects via container env

	cfg := &Config{
		HTTPPort:       getEnv("HTTP_PORT", "8090"),
		RabbitMQURL:    getEnv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672"),
		SessionQueue:   getEnv("SESSION_QUEUE", "sandbox.sessions"),
		KafkaBrokers:   getEnv("KAFKA_BROKERS", "localhost:19092"),
		KafkaClientID:  getEnv("KAFKA_CLIENT_ID", "sandbox-worker"),
		RedisURL:       getEnv("REDIS_URL", "redis://localhost:6379"),
		DatabaseURL:    getEnv("DATABASE_URL", ""),
		JWTSecret:      getEnv("JWT_SECRET", ""),
		SessionTTLMins: getEnvInt("SESSION_TTL_MINS", 60),
		MaxMemoryMB:    getEnvInt("MAX_MEMORY_MB", 512),
		MaxCPUs:        getEnvFloat("MAX_CPUS", 1.0),
		NetworkMode:    getEnv("DOCKER_NETWORK_MODE", "none"),
	}

	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}
	if cfg.JWTSecret == "" {
		return nil, fmt.Errorf("JWT_SECRET is required")
	}

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

