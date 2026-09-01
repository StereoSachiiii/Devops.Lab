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
	"github.com/devops-platform/sandbox/internal/messaging"
	"github.com/devops-platform/sandbox/internal/metrics"
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



	redisStore, err := store.NewRedisStore(cfg.RedisURL, cfg.SessionTTLMins, log, encryptionKey)
	if err != nil {
		log.Error("Redis connection failed", "error", err)
		os.Exit(1)
	}
	defer redisStore.Close()

	var provider sandbox.SandboxProvider
	var isolationDowngraded bool
	switch cfg.SandboxProvider {
	case "flintlock":
		if os.Getenv("FLINTLOCK_NETWORK_ISOLATION_CONFIRMED") != "true" {
			log.Error("Flintlock provider selected but FLINTLOCK_NETWORK_ISOLATION_CONFIRMED is not true. Refusing to boot due to network isolation risks.")
			os.Exit(1)
		}
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
			log.Warn("gVisor provider init failed, falling back to standard Docker provider for dev compatibility", "error", err)
			provider, err = sandbox.NewDockerProvider(cfg.NetworkMode, cfg.MaxMemoryMB, cfg.MaxCPUs, log)
			if err != nil {
				log.Error("Docker provider fallback failed", "error", err)
				os.Exit(1)
			}
			isolationDowngraded = true
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

	sessionMgr, err := session.NewManager(provider, redisStore, cfg.SessionTTLMins, cfg.WorkerAddr, log)
	if err != nil {
		log.Error("Session manager init failed", "error", err)
		os.Exit(1)
	}
	sessionMgr.IsolationDowngraded = isolationDowngraded
	sessionMgr.StartDiskMonitor(ctx)

	val := validator.NewValidator(provider, log)

	reaper := session.NewReaper(sessionMgr, time.Duration(cfg.SessionTTLMins)*time.Minute, log)
	go reaper.Start(ctx)

	// ── 5. Terminal Multiplexer ──────────────────────────────────────────
	multiplexer := terminal.NewMultiplexer(provider, log)

	// ── 6. HTTP Server ──────────────────────────────────────────────────
	mux := http.NewServeMux()
	mux.HandleFunc("/sessions/", terminal.Handler(sessionMgr, multiplexer, provider, cfg.JWTPublicKey, cfg.AllowedOrigins, log))

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

		startVal := time.Now()
		result, err := val.Check(r.Context(), data.ContainerID, sessionID)
		valDuration := time.Since(startVal).Seconds()
		if err != nil {
			metrics.ValidationDuration.WithLabelValues("error").Observe(valDuration)
			log.Error("Validator error", "sessionId", sessionID, "error", err)
			http.Error(w, "validator error", http.StatusInternalServerError)
			return
		}
		if result.Passed {
			metrics.ValidationDuration.WithLabelValues("true").Observe(valDuration)
		} else {
			metrics.ValidationDuration.WithLabelValues("false").Observe(valDuration)
		}

		var checks []messaging.ChallengeCheck
		for _, check := range result.CheckResults {
			checks = append(checks, messaging.ChallengeCheck{
				CheckID: check.CheckID,
				Passed:  check.Passed,
				Message: check.Message,
			})
		}

		if result.Passed {
			event := messaging.ChallengeResultEvent{
				SubmissionID: sessionID,
				ChallengeID:  data.ChallengeID,
				UserID:       data.UserID,
				Passed:       true,
				ExitCode:     result.ExitCode,
				DurationMs:   0,
				Checks:       checks,
			}
			if err := kafkaProducer.EmitResult(r.Context(), messaging.TopicChallengeSolved, event); err != nil {
				log.Error("Failed to emit challenge.solved", "error", err)
			}
		} else {
			event := messaging.ChallengeResultEvent{
				SubmissionID: sessionID,
				ChallengeID:  data.ChallengeID,
				UserID:       data.UserID,
				Passed:       false,
				ExitCode:     result.ExitCode,
				DurationMs:   0,
				Checks:       checks,
			}
			if err := kafkaProducer.EmitResult(r.Context(), messaging.TopicChallengeFailed, event); err != nil {
				log.Error("Failed to emit challenge.failed", "error", err)
			}
		}

		type validationHTTPResponse struct {
			Passed       bool                    `json:"passed"`
			Feedback     string                  `json:"feedback"`
			CheckResults []validator.CheckResult `json:"checkResults,omitempty"`
		}

		respBody := validationHTTPResponse{
			Passed:       result.Passed,
			Feedback:     result.Feedback,
			CheckResults: result.CheckResults,
		}

		w.Header().Set("Content-Type", "application/json")
		if result.Passed {
			w.WriteHeader(http.StatusOK)
		} else {
			w.WriteHeader(http.StatusUnprocessableEntity)
		}
		_ = json.NewEncoder(w).Encode(respBody)
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
	provisionQueue := "provision.sandbox." + cfg.SandboxProvider
	queues := []string{provisionQueue, "terminate.sandbox"}
	consumer := messaging.NewSessionConsumer(cfg.RabbitMQURL, queues, log)
	
	// Start consumer in a resilient reconnect loop
	go func() {
		var failCount int
		var lastLog time.Time
		for {
			if ctx.Err() != nil {
				return // Shutting down
			}

			if err := consumer.Connect(); err != nil {
				failCount++
				if failCount == 1 || time.Since(lastLog) > 45*time.Second {
					log.Warn("RabbitMQ consumer not connected (retrying in background, will self-heal when broker starts)", "error", err)
					lastLog = time.Now()
				}
				select {
				case <-time.After(5 * time.Second):
					continue
				case <-ctx.Done():
					return
				}
			}

			if failCount > 0 {
				log.Info("RabbitMQ Consumer connected and running (self-healed after retries)", "retryCount", failCount)
			} else {
				log.Info("RabbitMQ Consumer running")
			}
			failCount = 0

			err := consumer.Consume(ctx, messaging.Handlers{
				OnSessionStarted: func(ctx context.Context, job messaging.SessionStartedJob) error {
					_, err := sessionMgr.Create(ctx, job.SessionID, job.UserID, job.ChallengeID, job.Image)
					return err
				},
				OnSessionEnded: func(ctx context.Context, job messaging.SessionEndedJob) error {
					return sessionMgr.Destroy(ctx, job.SessionID)
				},
			})

			consumer.Close()

			if err != nil && ctx.Err() == nil {
				failCount++
				if failCount == 1 || time.Since(lastLog) > 45*time.Second {
					log.Warn("RabbitMQ consumer disconnected with error, reconnecting in background...", "error", err)
					lastLog = time.Now()
				}
				select {
				case <-time.After(5 * time.Second):
				case <-ctx.Done():
					return
				}
			}
		}
	}()

	<-ctx.Done()
	
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := server.Shutdown(shutdownCtx); err != nil && err != http.ErrServerClosed {
		log.Error("HTTP server shutdown error", "error", err)
	}

	log.Info("Sandbox Service shut down cleanly")
}
