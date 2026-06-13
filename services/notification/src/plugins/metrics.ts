import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { Counter, type Registry } from 'prom-client';
import { createRegistry, createHttpRequestDuration, createMetricsHook } from '@devops/observability';

declare module 'fastify' {
  interface FastifyInstance {
    metrics: {
      registry: Registry;
      emailSentCounter: Counter;
      emailFailedCounter: Counter;
    };
  }
}

export const metricsPlugin = fp(async (fastify: FastifyInstance) => {
  const registry = createRegistry('notification-service');
  const httpDuration = createHttpRequestDuration(registry);

  const emailSentCounter = new Counter({
    name: 'notification_email_sent_total',
    help: 'Total number of emails sent successfully',
    labelNames: ['type'] as const,
    registers: [registry],
  });

  const emailFailedCounter = new Counter({
    name: 'notification_email_failed_total',
    help: 'Total number of emails failed to send',
    labelNames: ['type'] as const,
    registers: [registry],
  });

  fastify.decorate('metrics', {
    registry,
    emailSentCounter,
    emailFailedCounter,
  });

  fastify.addHook('onResponse', createMetricsHook(httpDuration));

  fastify.get('/metrics', async (_request, reply) => {
    const metrics = await registry.metrics();
    return reply
      .header('Content-Type', registry.contentType)
      .send(metrics);
  });
});
