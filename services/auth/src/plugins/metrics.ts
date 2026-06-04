import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import type { Counter, Histogram, Registry } from 'prom-client';
import {
  createRegistry,
  createHttpRequestDuration,
  createAuthLoginCounter,
  createAuthRegisterCounter,
  createAuthLoginDuration,
  createMetricsHook,
} from '@devops/observability';

declare module 'fastify' {
  interface FastifyInstance {
    metrics: {
      registry:        Registry;
      loginCounter:    Counter;
      registerCounter: Counter;
      loginDuration:   Histogram;
    };
  }
}

/**
 * Prometheus metrics plugin.
 *
 * Creates a per-service metrics registry, registers HTTP + auth-specific
 * metrics, hooks into Fastify's request lifecycle to record durations,
 * and exposes GET /metrics for Prometheus scraping.
 */
export const metricsPlugin = fp(async (fastify: FastifyInstance) => {
  const registry        = createRegistry('auth-service');
  const httpDuration    = createHttpRequestDuration(registry);
  const loginCounter    = createAuthLoginCounter(registry);
  const registerCounter = createAuthRegisterCounter(registry);
  const loginDuration   = createAuthLoginDuration(registry);

  // Decorate so routes can access counters/histograms.
  fastify.decorate('metrics', {
    registry,
    loginCounter,
    registerCounter,
    loginDuration,
  });

  // Auto-record HTTP request duration + status for every route.
  fastify.addHook('onResponse', createMetricsHook(httpDuration));

  // Expose Prometheus scrape endpoint.
  fastify.get('/metrics', async (_request, reply) => {
    const metrics = await registry.metrics();
    
    return reply
      .header('Content-Type', registry.contentType)
      .send(metrics);
  });
});
