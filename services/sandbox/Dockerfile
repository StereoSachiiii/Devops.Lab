# ── Build Stage ───────────────────────────────────────────────────────────────
FROM golang:1.22-alpine AS builder

# Install git for go mod download (some deps require it)
RUN apk add --no-cache git

WORKDIR /app

# Cache deps layer — only re-runs when go.mod/go.sum changes
COPY go.mod go.sum ./
RUN go mod download

# Copy source and build a statically linked binary
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /sandbox-worker .

# ── Runtime Stage ─────────────────────────────────────────────────────────────
# Use distroless for a minimal attack surface — no shell, no package manager
FROM gcr.io/distroless/static-debian12

COPY --from=builder /sandbox-worker /sandbox-worker

# Run as non-root user (distroless provides 'nonroot' = uid 65532)
USER nonroot:nonroot

ENTRYPOINT ["/sandbox-worker"]
