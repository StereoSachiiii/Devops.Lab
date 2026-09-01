package config

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"os"
	"strings"
	"testing"
)

func generateTestRSAPublicKeyPEM(t *testing.T) string {
	t.Helper()
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("Failed to generate RSA key pair: %v", err)
	}
	pubASN1, err := x509.MarshalPKIXPublicKey(&privateKey.PublicKey)
	if err != nil {
		t.Fatalf("Failed to marshal PKIX public key: %v", err)
	}
	pubBytes := pem.EncodeToMemory(&pem.Block{
		Type:  "PUBLIC KEY",
		Bytes: pubASN1,
	})
	return string(pubBytes)
}

func generateTestEncryptionKey(t *testing.T) string {
	t.Helper()
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		t.Fatalf("Failed to generate encryption key: %v", err)
	}
	return base64.StdEncoding.EncodeToString(key)
}

func TestConfig_LoadDefaultsAndValidation(t *testing.T) {
	// Backup current env
	origEnv := map[string]string{
		"REDIS_URL":           os.Getenv("REDIS_URL"),
		"KAFKA_BROKERS":       os.Getenv("KAFKA_BROKERS"),
		"DATABASE_URL":        os.Getenv("DATABASE_URL"),
		"JWT_PUBLIC_KEY":      os.Getenv("JWT_PUBLIC_KEY"),
		"ENCRYPTION_KEY":      os.Getenv("ENCRYPTION_KEY"),
		"ALLOWED_ORIGINS":     os.Getenv("ALLOWED_ORIGINS"),
		"SESSION_TTL_MINS":    os.Getenv("SESSION_TTL_MINS"),
		"MAX_MEMORY_MB":       os.Getenv("MAX_MEMORY_MB"),
		"MAX_CPUS":            os.Getenv("MAX_CPUS"),
		"DOCKER_NETWORK_MODE": os.Getenv("DOCKER_NETWORK_MODE"),
		"SANDBOX_PROVIDER":    os.Getenv("SANDBOX_PROVIDER"),
	}
	defer func() {
		for k, v := range origEnv {
			if v == "" {
				os.Unsetenv(k)
			} else {
				os.Setenv(k, v)
			}
		}
	}()

	validPubKeyPEM := generateTestRSAPublicKeyPEM(t)
	validEncKey := generateTestEncryptionKey(t)

	t.Run("Missing REDIS_URL returns error", func(t *testing.T) {
		os.Unsetenv("REDIS_URL")
		os.Setenv("KAFKA_BROKERS", "localhost:9092")
		os.Setenv("DATABASE_URL", "postgres://localhost/test")
		os.Setenv("JWT_PUBLIC_KEY", validPubKeyPEM)
		os.Setenv("ENCRYPTION_KEY", validEncKey)

		cfg, err := Load()
		if err == nil {
			t.Fatalf("Expected error when REDIS_URL is missing, got nil (cfg: %+v)", cfg)
		}
		if !strings.Contains(err.Error(), "REDIS_URL is required") {
			t.Errorf("Unexpected error message: %v", err)
		}
	})

	t.Run("Missing KAFKA_BROKERS returns error", func(t *testing.T) {
		os.Setenv("REDIS_URL", "redis://localhost:6379")
		os.Unsetenv("KAFKA_BROKERS")
		os.Setenv("DATABASE_URL", "postgres://localhost/test")
		os.Setenv("JWT_PUBLIC_KEY", validPubKeyPEM)
		os.Setenv("ENCRYPTION_KEY", validEncKey)

		_, err := Load()
		if err == nil {
			t.Fatalf("Expected error when KAFKA_BROKERS is missing, got nil")
		}
		if !strings.Contains(err.Error(), "KAFKA_BROKERS ENV VAR is missing") {
			t.Errorf("Unexpected error message: %v", err)
		}
	})

	t.Run("Missing DATABASE_URL returns error", func(t *testing.T) {
		os.Setenv("REDIS_URL", "redis://localhost:6379")
		os.Setenv("KAFKA_BROKERS", "localhost:9092")
		os.Unsetenv("DATABASE_URL")
		os.Setenv("JWT_PUBLIC_KEY", validPubKeyPEM)
		os.Setenv("ENCRYPTION_KEY", validEncKey)

		_, err := Load()
		if err == nil {
			t.Fatalf("Expected error when DATABASE_URL is missing, got nil")
		}
		if !strings.Contains(err.Error(), "DATABASE_URL is required") {
			t.Errorf("Unexpected error message: %v", err)
		}
	})

	t.Run("Missing JWT_PUBLIC_KEY returns error", func(t *testing.T) {
		os.Setenv("REDIS_URL", "redis://localhost:6379")
		os.Setenv("KAFKA_BROKERS", "localhost:9092")
		os.Setenv("DATABASE_URL", "postgres://localhost/test")
		os.Unsetenv("JWT_PUBLIC_KEY")
		os.Setenv("ENCRYPTION_KEY", validEncKey)

		_, err := Load()
		if err == nil {
			t.Fatalf("Expected error when JWT_PUBLIC_KEY is missing, got nil")
		}
		if !strings.Contains(err.Error(), "JWT_PUBLIC_KEY is required") {
			t.Errorf("Unexpected error message: %v", err)
		}
	})

	t.Run("Invalid JWT_PUBLIC_KEY format returns error", func(t *testing.T) {
		os.Setenv("REDIS_URL", "redis://localhost:6379")
		os.Setenv("KAFKA_BROKERS", "localhost:9092")
		os.Setenv("DATABASE_URL", "postgres://localhost/test")
		os.Setenv("JWT_PUBLIC_KEY", "NOT_A_VALID_PEM")
		os.Setenv("ENCRYPTION_KEY", validEncKey)

		_, err := Load()
		if err == nil {
			t.Fatalf("Expected error for invalid JWT_PUBLIC_KEY, got nil")
		}
		if !strings.Contains(err.Error(), "failed to parse JWT_PUBLIC_KEY") {
			t.Errorf("Unexpected error message: %v", err)
		}
	})

	t.Run("Missing ENCRYPTION_KEY returns error", func(t *testing.T) {
		os.Setenv("REDIS_URL", "redis://localhost:6379")
		os.Setenv("KAFKA_BROKERS", "localhost:9092")
		os.Setenv("DATABASE_URL", "postgres://localhost/test")
		os.Setenv("JWT_PUBLIC_KEY", validPubKeyPEM)
		os.Unsetenv("ENCRYPTION_KEY")

		_, err := Load()
		if err == nil {
			t.Fatalf("Expected error when ENCRYPTION_KEY is missing, got nil")
		}
		if !strings.Contains(err.Error(), "ENCRYPTION_KEY is required") {
			t.Errorf("Unexpected error message: %v", err)
		}
	})

	t.Run("ENCRYPTION_KEY with wrong byte length returns error", func(t *testing.T) {
		os.Setenv("REDIS_URL", "redis://localhost:6379")
		os.Setenv("KAFKA_BROKERS", "localhost:9092")
		os.Setenv("DATABASE_URL", "postgres://localhost/test")
		os.Setenv("JWT_PUBLIC_KEY", validPubKeyPEM)
		// 16 bytes instead of 32
		shortKey := base64.StdEncoding.EncodeToString(make([]byte, 16))
		os.Setenv("ENCRYPTION_KEY", shortKey)

		_, err := Load()
		if err == nil {
			t.Fatalf("Expected error when ENCRYPTION_KEY byte length != 32, got nil")
		}
		if !strings.Contains(err.Error(), "must decode to 32 bytes") {
			t.Errorf("Unexpected error message: %v", err)
		}
	})

	t.Run("Valid load sets correct defaults and custom values", func(t *testing.T) {
		os.Setenv("REDIS_URL", "redis://localhost:6379")
		os.Setenv("KAFKA_BROKERS", "localhost:9092")
		os.Setenv("DATABASE_URL", "postgres://localhost/test")
		os.Setenv("JWT_PUBLIC_KEY", validPubKeyPEM)
		os.Setenv("ENCRYPTION_KEY", validEncKey)

		// Set custom env vars
		os.Setenv("ALLOWED_ORIGINS", "http://app.example.com,https://dashboard.dev")
		os.Setenv("SESSION_TTL_MINS", "120")
		os.Setenv("MAX_MEMORY_MB", "1024")
		os.Setenv("MAX_CPUS", "2.5")

		cfg, err := Load()
		if err != nil {
			t.Fatalf("Unexpected load error: %v", err)
		}

		if cfg.AllowedOrigins != "http://app.example.com,https://dashboard.dev" {
			t.Errorf("Expected AllowedOrigins 'http://app.example.com,https://dashboard.dev', got %q", cfg.AllowedOrigins)
		}
		if cfg.SessionTTLMins != 120 {
			t.Errorf("Expected SessionTTLMins 120, got %d", cfg.SessionTTLMins)
		}
		if cfg.MaxMemoryMB != 1024 {
			t.Errorf("Expected MaxMemoryMB 1024, got %d", cfg.MaxMemoryMB)
		}
		if cfg.MaxCPUs != 2.5 {
			t.Errorf("Expected MaxCPUs 2.5, got %f", cfg.MaxCPUs)
		}
		if cfg.JWTPublicKey == nil {
			t.Errorf("JWTPublicKey should be non-nil")
		}
		if len(cfg.EncryptionKey) != 32 {
			t.Errorf("EncryptionKey length should be 32 bytes, got %d", len(cfg.EncryptionKey))
		}
	})
}
