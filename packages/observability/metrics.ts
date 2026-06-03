// packages/observability/metrics.ts

import client, { Counter, Histogram, Registry } from 'prom-client';

// ─── Shared registry ──────────────────────────────────────────────────────────
// Each service gets its own registry so metrics are scoped per-service.

/** Create a fresh Prometheus registry with default metrics (CPU, memory, etc.). */
export function createRegistry(serviceName: string): Registry {
  const registry = new Registry();
  registry.setDefaultLabels({ service: serviceName });

  // Standard Node.js metrics: event loop lag, heap usage, GC, etc.
  client.collectDefaultMetrics({ register: registry });

  return registry;
}

// ─── Pre-built metric factories ───────────────────────────────────────────────

/** HTTP request duration histogram — auto-recorded by the metrics middleware. */
export function createHttpRequestDuration(registry: Registry): Histogram {
  return new Histogram({
    name:       'http_request_duration_seconds',
    help:       'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status'] as const,
    buckets:    [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers:  [registry],
  });
}

/** Auth login attempt counter. */
export function createAuthLoginCounter(registry: Registry): Counter {
  return new Counter({
    name:       'auth_login_total',
    help:       'Total number of login attempts',
    labelNames: ['outcome'] as const,
    registers:  [registry],
  });
}

/** Auth register attempt counter. */
export function createAuthRegisterCounter(registry: Registry): Counter {
  return new Counter({
    name:       'auth_register_total',
    help:       'Total number of registration attempts',
    labelNames: ['outcome'] as const,
    registers:  [registry],
  });
}

/** Auth login flow duration histogram. */
export function createAuthLoginDuration(registry: Registry): Histogram {
  return new Histogram({
    name:    'auth_login_duration_seconds',
    help:    'Duration of the login flow in seconds',
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5],
    registers: [registry],
  });
}

// ─── Fastify middleware ───────────────────────────────────────────────────────

/**
 * Returns an `onResponse` hook that records request duration and status code.
 * Register it as a Fastify hook: `fastify.addHook('onResponse', metricsHook)`.
 */
export function createMetricsHook(
  histogram: Histogram<'method' | 'route' | 'status'>,
) {
  return async function metricsHook(request: any, reply: any): Promise<void> {
    const duration = reply.elapsedTime / 1000; // Fastify provides elapsedTime in ms
    histogram.observe(
      {
        method: request.method,
        route:  request.routeOptions?.url ?? request.url,
        status: String(reply.statusCode),
      },
      duration,
    );
  };
}
