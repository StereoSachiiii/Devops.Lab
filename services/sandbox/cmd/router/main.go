package main

import (
	"context"
	"encoding/base64"
	"log/slog"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/devops-platform/sandbox/internal/store"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

var (
	routerRequests = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "sandbox_router_requests_total",
			Help: "Total requests handled by the sandbox reverse proxy router",
		},
		[]string{"path_prefix", "status"},
	)
	routerDuration = prometheus.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "sandbox_router_request_duration_seconds",
			Help:    "Duration of routed requests in seconds",
			Buckets: prometheus.DefBuckets,
		},
		[]string{"path_prefix"},
	)
)

func init() {
	prometheus.MustRegister(routerRequests, routerDuration)
}

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))

	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		redisURL = "redis://localhost:6379"
	}
	encKey := os.Getenv("ENCRYPTION_KEY")
	if encKey == "" {
		log.Error("ENCRYPTION_KEY is required")
		os.Exit(1)
	}
	keyBytes, err := base64.StdEncoding.DecodeString(encKey)
	if err != nil {
		log.Error("Invalid ENCRYPTION_KEY format", "error", err)
		os.Exit(1)
	}

	redisStore, err := store.NewRedisStore(redisURL, 60, log, keyBytes)
	if err != nil {
		log.Error("Redis store init failed", "error", err)
		os.Exit(1)
	}
	defer redisStore.Close()

	mux := http.NewServeMux()

	// Generic reverse proxy handler
	proxyHandler := func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		prefix := "other"
		if strings.HasPrefix(r.URL.Path, "/sessions/") {
			prefix = "sessions"
		} else if strings.HasPrefix(r.URL.Path, "/validate/") {
			prefix = "validate"
		}

		sessionID := extractSessionID(r.URL.Path)
		if sessionID == "" {
			routerRequests.WithLabelValues(prefix, "400").Inc()
			http.Error(w, "missing session ID in path", http.StatusBadRequest)
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()

		data, err := redisStore.Get(ctx, sessionID)
		if err != nil {
			routerRequests.WithLabelValues(prefix, "500").Inc()
			log.Error("Redis get failed", "error", err)
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		if data == nil || data.WorkerAddr == "" {
			routerRequests.WithLabelValues(prefix, "404").Inc()
			http.Error(w, "session not found or worker unknown", http.StatusNotFound)
			return
		}

		targetURL, err := url.Parse("http://" + data.WorkerAddr)
		if err != nil {
			routerRequests.WithLabelValues(prefix, "500").Inc()
			log.Error("Invalid worker address", "addr", data.WorkerAddr, "error", err)
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		routerRequests.WithLabelValues(prefix, "200").Inc()
		routerDuration.WithLabelValues(prefix).Observe(time.Since(start).Seconds())

		proxy := httputil.NewSingleHostReverseProxy(targetURL)
		
		originalDirector := proxy.Director
		proxy.Director = func(req *http.Request) {
			originalDirector(req)
			req.Host = r.Host 
		}

		proxy.ServeHTTP(w, r)
	}

	mux.HandleFunc("/sessions/", proxyHandler)
	mux.HandleFunc("/validate/", proxyHandler)
	
	// Health check for the router itself
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})

	// Prometheus metrics endpoint
	mux.Handle("/metrics", promhttp.Handler())

	addr := ":8080"
	log.Info("Starting sandbox-router", "addr", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Error("Server failed", "error", err)
		os.Exit(1)
	}
}

// extractSessionID gets the sessionID from /sessions/{id}/terminal or /validate/{id}
func extractSessionID(path string) string {
	// Strip query parameters if present
	if idx := strings.Index(path, "?"); idx != -1 {
		path = path[:idx]
	}
	clean := strings.Trim(path, "/")
	if clean == "" {
		return ""
	}
	parts := strings.Split(clean, "/")
	if len(parts) >= 2 {
		if parts[0] == "sessions" || parts[0] == "validate" {
			return parts[1]
		}
	}
	return ""
}
