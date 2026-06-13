import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { Counter, type Registry } from 'prom-client';
import { createRegistry, createHttpRequestDuration, createMetricsHook } from '@devops/observability';

declare module 'fastify' {
  interface FastifyInstance {
    metrics: {
      registry: Registry;
      sessionStartCounter: Counter;
      sessionEndCounter: Counter;
      challengeSolvedCounter: Counter;
      challengeFailedCounter: Counter;
    };
  }
}

export const metricsPlugin = fp(async (fastify: FastifyInstance) => {
  const registry = createRegistry('core-service');
  const httpDuration = createHttpRequestDuration(registry);

  const sessionStartCounter = new Counter({
    name: 'core_session_start_total',
    help: 'Total number of challenge sessions started',
    labelNames: ['challengeId'] as const,
    registers: [registry],
  });

  const sessionEndCounter = new Counter({
    name: 'core_session_end_total',
    help: 'Total number of challenge sessions ended',
    labelNames: ['reason'] as const,
    registers: [registry],
  });

  const challengeSolvedCounter = new Counter({
    name: 'core_challenge_solved_total',
    help: 'Total number of challenges solved',
    labelNames: ['challengeId'] as const,
    registers: [registry],
  });

  const challengeFailedCounter = new Counter({
    name: 'core_challenge_failed_total',
    help: 'Total number of challenges failed',
    labelNames: ['challengeId'] as const,
    registers: [registry],
  });

  fastify.decorate('metrics', {
    registry,
    sessionStartCounter,
    sessionEndCounter,
    challengeSolvedCounter,
    challengeFailedCounter,
  });

  fastify.addHook('onResponse', createMetricsHook(httpDuration));

  fastify.get('/metrics', async (_request, reply) => {
    const metrics = await registry.metrics();
    return reply
      .header('Content-Type', registry.contentType)
      .send(metrics);
  });
});
