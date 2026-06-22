package main

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/devops-platform/sandbox/internal/config"
	"github.com/devops-platform/sandbox/internal/db"
	"github.com/devops-platform/sandbox/internal/messaging"
	"github.com/devops-platform/sandbox/internal/sandbox"
	"github.com/devops-platform/sandbox/internal/session"
	"github.com/devops-platform/sandbox/internal/store"
	"github.com/devops-platform/sandbox/internal/terminal"
	"github.com/devops-platform/sandbox/internal/validator"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

func main() {
	

	log := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(log)

	log.Info("Sandbox Service starting...")

	cfg, err := config.Load()
	if err != nil {
		log.Error("Config load failed", "error", err)
		os.Exit(1)
	}

	encryptionKey := cfg.EncryptionKey

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	dbClient, err := db.NewClient(cfg.DatabaseURL, log)
	if err != nil {
		log.Error("Postgres connection failed", "error", err)
		os.Exit(1)
	}
	defer dbClient.Close()

	redisStore, err := store.NewRedisStore(cfg.RedisURL, cfg.SessionTTLMins, log, encryptionKey)
	if err != nil {
		log.Error("Redis connection failed", "error", err)
		os.Exit(1)
	}
	defer redisStore.Close()

	var provider sandbox.SandboxProvider
	switch cfg.SandboxProvider {
	case "flintlock":
		provider, err = sandbox.NewFlintlockProvider(cfg.FlintlockAddress, log)
		if err != nil {
			log.Error("Flintlock provider init failed", "error", err)
			os.Exit(1)
		}
	case "kata":
		provider, err = sandbox.NewKataProvider(cfg.NetworkMode, cfg.MaxMemoryMB, cfg.MaxCPUs, log)
		if err != nil {
			log.Error("Kata provider init failed", "error", err)
			os.Exit(1)
		}
	case "gvisor":
		provider, err = sandbox.NewGVisorProvider(cfg.NetworkMode, cfg.MaxMemoryMB, cfg.MaxCPUs, log)
		if err != nil {
			log.Error("gVisor provider init failed", "error", err)
			os.Exit(1)
		}
	case "docker":
		fallthrough
	default:
		provider, err = sandbox.NewDockerProvider(cfg.NetworkMode, cfg.MaxMemoryMB, cfg.MaxCPUs, log)
		if err != nil {
			log.Error("Docker provider init failed", "error", err)
			os.Exit(1)
		}
	}

	kafkaProducer := messaging.NewKafkaProducer(cfg.KafkaBrokers, cfg.KafkaClientID, log)
	defer kafkaProducer.Close()

	sessionMgr, err := session.NewManager(provider, redisStore, cfg.SessionTTLMins, log)
	if err != nil {
		log.Error("Session manager init failed", "error", err)
		os.Exit(1)
	}

	val := validator.NewValidator(provider, log)

	reaper := session.NewReaper(sessionMgr, time.Duration(cfg.SessionTTLMins)*time.Minute, log)
	go reaper.Start(ctx)

	mux := http.NewServeMux()

	mux.HandleFunc("/sessions/", terminal.Handler(sessionMgr, provider, cfg.JWTPublicKey, cfg.AllowedOrigins, log))

	mux.HandleFunc("/validate/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		sessionID := r.URL.Path[len("/validate/"):]
		if sessionID == "" {
			http.Error(w, "missing session ID", http.StatusBadRequest)
			return
		}

		data, err := sessionMgr.Get(r.Context(), sessionID)
		if err != nil || data == nil {
			http.Error(w, "session not found", http.StatusNotFound)
			return
		}

		result, err := val.Check(r.Context(), data.ContainerID, sessionID)
		if err != nil {
			log.Error("Validator error", "sessionId", sessionID, "error", err)
			http.Error(w, "validator error", http.StatusInternalServerError)
			return
		}

		if result.Passed {
			event := messaging.ChallengeResultEvent{
				SubmissionID: sessionID,
				ChallengeID:  data.ChallengeID,
				UserID:       data.UserID,
				Passed:       true,
				ExitCode:     result.ExitCode,
				DurationMs:   0,
			}
			if err := kafkaProducer.EmitResult(r.Context(), messaging.TopicChallengeSolved, event); err != nil {
				log.Error("Failed to emit challenge.solved", "error", err)
			}
			// Update submission status to COMPLETED in Postgres
			if err := dbClient.UpdateSubmissionStatus(r.Context(), sessionID, db.StatusCompleted, map[string]any{
				"passed":   true,
				"exitCode": result.ExitCode,
				"feedback": result.Feedback,
			}); err != nil {
				log.Error("Failed to update submission status to COMPLETED", "sessionId", sessionID, "error", err)
			}
		} else {
			// Update submission status to FAILED in Postgres
			if err := dbClient.UpdateSubmissionStatus(r.Context(), sessionID, db.StatusFailed, map[string]any{
				"passed":   false,
				"exitCode": result.ExitCode,
				"feedback": result.Feedback,
			}); err != nil {
				log.Error("Failed to update submission status to FAILED", "sessionId", sessionID, "error", err)
			}
		}

		w.Header().Set("Content-Type", "application/json")
		if result.Passed {
			w.WriteHeader(http.StatusOK)
		} else {
			w.WriteHeader(http.StatusUnprocessableEntity)
		}
		_, _ = w.Write([]byte(`{"passed":` + boolStr(result.Passed) + `,"feedback":` + jsonStr(result.Feedback) + `}`))
	})

	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})

	mux.Handle("/metrics", promhttp.Handler())

	server := &http.Server{
		Addr:    ":" + cfg.HTTPPort,
		Handler: mux,
	}

	go func() {
		log.Info("HTTP server listening", "port", cfg.HTTPPort)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Error("HTTP server error", "error", err)
		}
	}()

	// RabbitMQ session consumer (Replaces Kafka for Sandbox Orchestration)
	queues := []string{"provision.sandbox", "terminate.sandbox"}
	consumer := messaging.NewSessionConsumer(cfg.RabbitMQURL, queues, log)
	if err := consumer.Connect(); err != nil {
		log.Error("Failed to connect RabbitMQ consumer", "error", err)
		os.Exit(1)
	}
	defer consumer.Close()

	log.Info("Sandbox Service ready",
		"httpPort", cfg.HTTPPort,
		"rabbitmq", cfg.RabbitMQURL,
	)

	errCh := make(chan error, 1)
	go func() {
		errCh <- consumer.Consume(ctx, messaging.Handlers{
			OnSessionStarted: func(ctx context.Context, job messaging.SessionStartedJob) error {
				_, err := sessionMgr.Create(ctx, job.SessionID, job.UserID, job.ChallengeID, job.Image)
				return err
			},
			OnSessionEnded: func(ctx context.Context, job messaging.SessionEndedJob) error {
				return sessionMgr.Destroy(ctx, job.SessionID)
			},
		})
	}()

	<-ctx.Done()
	
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := server.Shutdown(shutdownCtx); err != nil && err != http.ErrServerClosed {
		log.Error("HTTP server shutdown error", "error", err)
	}

	if err := <-errCh; err != nil {
		log.Error("Consumer exited with error", "error", err)
		return
	}

	log.Info("Sandbox Service shut down cleanly")
}

func boolStr(b bool) string {
	if b {
		return "true"
	}
	return "false"
}

func jsonStr(s string) string {
	b, _ := json.Marshal(s)
	return string(b)
}
