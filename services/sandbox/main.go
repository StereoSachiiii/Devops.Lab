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
)

func main() {
	// ── Logger ─────────────────────────────────────────────────────────────────
	log := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(log)
	log.Info("🚀 Sandbox Service starting...")

	// ── Config ─────────────────────────────────────────────────────────────────
	cfg, err := config.Load()
	if err != nil {
		log.Error("Config load failed", "error", err)
		os.Exit(1)
	}

	// ── Graceful shutdown context ───────────────────────────────────────────────
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// ── Infrastructure connections ──────────────────────────────────────────────
	dbClient, err := db.NewClient(cfg.DatabaseURL, log)
	if err != nil {
		log.Error("Postgres connection failed", "error", err)
		os.Exit(1)
	}
	defer dbClient.Close()

	redisStore, err := store.NewRedisStore(cfg.RedisURL, cfg.SessionTTLMins, log)
	if err != nil {
		log.Error("Redis connection failed", "error", err)
		os.Exit(1)
	}
	defer redisStore.Close()

	dockerProvider, err := sandbox.NewDockerProvider(cfg.NetworkMode, cfg.MaxMemoryMB, cfg.MaxCPUs, log)
	if err != nil {
		log.Error("Docker provider init failed", "error", err)
		os.Exit(1)
	}

	kafkaProducer := messaging.NewKafkaProducer(cfg.KafkaBrokers, cfg.KafkaClientID, log)
	defer kafkaProducer.Close()

	// ── Session Manager (re-adopts existing sessions from Redis on restart) ─────
	sessionMgr, err := session.NewManager(dockerProvider, redisStore, cfg.SessionTTLMins, log)
	if err != nil {
		log.Error("Session manager init failed", "error", err)
		os.Exit(1)
	}

	// ── Validator ───────────────────────────────────────────────────────────────
	val := validator.NewValidator(dockerProvider, log)
	_ = val // used by the HTTP validate endpoint below

	// ── TTL Reaper — runs in background ────────────────────────────────────────
	reaper := session.NewReaper(sessionMgr, time.Duration(cfg.SessionTTLMins)*time.Minute, log)
	go reaper.Start(ctx)

	// ── HTTP Server (WebSocket terminal + validate endpoint) ───────────────────
	mux := http.NewServeMux()

	// GET /sessions/{id}/terminal → WebSocket terminal
	mux.HandleFunc("/sessions/", terminal.Handler(sessionMgr, dockerProvider, cfg.JWTSecret, log))

	// POST /sessions/{id}/validate → run /validator.sh
	mux.HandleFunc("/validate/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		// Extract sessionID from /validate/{sessionID}
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

		// Emit Kafka event if passed
		if result.Passed {
			event := messaging.ChallengeResultEvent{
				SubmissionID: sessionID, // use sessionID as submission correlation
				ChallengeID:  data.ChallengeID,
				UserID:       data.UserID,
				Passed:       true,
				ExitCode:     result.ExitCode,
				DurationMs:   0,
			}
			if err := kafkaProducer.EmitResult(r.Context(), messaging.TopicChallengeSolved, event); err != nil {
				log.Error("Failed to emit challenge.solved", "error", err)
			}
		}

		w.Header().Set("Content-Type", "application/json")
		if result.Passed {
			w.WriteHeader(http.StatusOK)
		} else {
			w.WriteHeader(http.StatusUnprocessableEntity) // 422 = failed validation
		}
		_, _ = w.Write([]byte(`{"passed":` + boolStr(result.Passed) + `,"feedback":` + jsonStr(result.Feedback) + `}`))
	})

	// GET /health
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})

	server := &http.Server{
		Addr:    ":" + cfg.HTTPPort,
		Handler: mux,
	}

	go func() {
		log.Info("🌐 HTTP server listening", "port", cfg.HTTPPort)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Error("HTTP server error", "error", err)
		}
	}()

	// ── RabbitMQ Consumer ──────────────────────────────────────────────────────
	consumer := messaging.NewSessionConsumer(cfg.RabbitMQURL, cfg.SessionQueue, log)
	if err := consumer.Connect(); err != nil {
		log.Error("RabbitMQ connection failed", "error", err)
		os.Exit(1)
	}
	defer consumer.Close()

	log.Info("✅ Sandbox Service ready",
		"httpPort", cfg.HTTPPort,
		"queue", cfg.SessionQueue,
	)

	// ── Main event loop — blocks until SIGTERM ─────────────────────────────────
	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdownCtx)
	}()

	if err := consumer.Consume(ctx, messaging.Handlers{
		OnSessionStarted: func(ctx context.Context, job messaging.SessionStartedJob) error {
			_, err := sessionMgr.Create(ctx, job.SessionID, job.UserID, job.ChallengeID, job.Image)
			return err
		},
		OnSessionEnded: func(ctx context.Context, job messaging.SessionEndedJob) error {
			return sessionMgr.Destroy(ctx, job.SessionID)
		},
	}); err != nil {
		log.Error("Consumer exited with error", "error", err)
		os.Exit(1)
	}

	log.Info("👋 Sandbox Service shut down cleanly")
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
