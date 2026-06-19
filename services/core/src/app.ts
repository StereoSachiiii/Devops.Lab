import Fastify, { FastifyRequest, FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import fastifyRedis from '@fastify/redis';
import { PrismaClient } from '@devops/db';
import { MessagingService, RabbitMQService } from '@devops/messaging';
import type { ObservabilityConfig } from '@devops/observability';
import pino from 'pino';
import './types';

import { nodeRoutes } from './modules/content/node.routes';
import { quizRoutes } from './modules/content/quiz.routes';
import { challengeRoutes } from './modules/challenge/challenge.routes';
import { registerProgressConsumers } from './modules/progress/consumers';
import { registerHealthChecks } from './utils/health';
import { metricsPlugin } from './plugins/metrics';
import { startOutboxPoller } from './plugins/outbox-poller';

export interface AppOptions extends ObservabilityConfig {
  jwtPublicKey: string;
  sessionTTLMins: number;
}

export async function buildApp(opts: AppOptions) {
  const app = Fastify({
    logger: pino(opts.loggerOptions, opts.stream as any),
  }).withTypeProvider<TypeBoxTypeProvider>();

  await app.register(fastifyRedis, {
    url: process.env.REDIS_URL || 'redis://redis:6379/0',
  });

  await app.register(cors, { origin: true });

  // Public key only — core verifies tokens, never signs
  await app.register(cookie);
  await app.register(jwt, {
    secret: {
      private: '',
      public: opts.jwtPublicKey,
    },
    verify: { algorithms: ['RS256'] },
    cookie: { cookieName: 'token', signed: false },
  });

  const prisma = new PrismaClient();
  app.decorate('prisma', prisma);

  const kafka = new MessagingService('core-service');
  app.decorate('kafka', kafka);

  const rabbitmq = new RabbitMQService();
  app.decorate('rabbitmq', rabbitmq);

  app.decorate('sessionTTLMins', opts.sessionTTLMins);

  await app.register(metricsPlugin);

  app.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
    try {
      await request.jwtVerify();
    } catch (err) {
      app.log.warn({ err }, 'Unauthorized access attempt');
      reply.code(401).send({ error: 'Unauthorized' });
    }
  });

  // Dual-registered for Kong (strip_path=true at root) and direct access (/api/content)
  await app.register(nodeRoutes);
  await app.register(nodeRoutes, { prefix: '/api/content' });

  await app.register(quizRoutes);
  await app.register(quizRoutes, { prefix: '/api/content' });

  // Kong uses strip_path=false, so routes include /api prefix
  await app.register(challengeRoutes, { prefix: '/api' });

  registerHealthChecks(app as any, prisma, kafka);

  let poller: NodeJS.Timeout | undefined;

  app.addHook('onReady', async () => {
    prisma.$connect()
      .then(() => app.log.info('Connected to Database'))
      .catch((err) => app.log.error({ err: err.message }, 'Database connection failed'));

    rabbitmq.init()
      .then(() => app.log.info('RabbitMQ initialized'))
      .catch((err) => app.log.error({ err: err.message }, 'RabbitMQ initialization failed'));

    kafka.initProducer()
      .then(async () => {
        app.log.info('Kafka producer initialized');
        await registerProgressConsumers(app as any);
        // Start outbox poller after Kafka & RabbitMQ are ready
        poller = startOutboxPoller(app as any);
      })
      .catch((err) => app.log.error({ err: err.message }, 'Kafka initialization failed'));
  });

  app.setErrorHandler(function (error, request, reply) {
    try {
      this.log.error({ err: error, method: request.method, url: request.url }, 'Unhandled error');
    } catch (_) {}
    reply.send(error);
  });

  app.addHook('onClose', async () => {
    if (poller) {
      clearInterval(poller);
    }
    await prisma.$disconnect();
    await kafka.disconnect();
    await rabbitmq.disconnect();
  });

  return app;
}
