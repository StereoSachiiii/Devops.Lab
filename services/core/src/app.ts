import Fastify, { FastifyRequest, FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { PrismaClient } from '@devops/db';
import { RabbitMQService, MessagingService } from '@devops/messaging';
import type { MultiStreamRes, LoggerOptions } from 'pino';
import './types';

import { nodeRoutes } from './modules/content/node.routes';
import { quizRoutes } from './modules/content/quiz.routes';
import { challengeRoutes } from './modules/challenge/challenge.routes';
import { registerProgressConsumers } from './modules/progress/consumers';
import { registerNotificationConsumers } from './modules/notification/consumers';

export interface AppOptions {
  loggerOptions: LoggerOptions;
  stream: MultiStreamRes;
  jwtPublicKey: string;
  rabbitMQUrl: string;
  sessionQueue: string;
  sessionTTLMins: number;
}

export async function buildApp(opts: AppOptions) {
  const app = Fastify({
    logger: opts.loggerOptions,
  }).withTypeProvider<TypeBoxTypeProvider>();

  await app.register(cors, { origin: true });

  // ── JWT (public key only — core service verifies, never signs) ──
  await app.register(jwt, {
    secret: {
      private: '',
      public: opts.jwtPublicKey,
    },
    verify: { algorithms: ['RS256'] },
  });

  // ── Database ──
  const prisma = new PrismaClient();
  app.decorate('prisma', prisma);

  // ── RabbitMQ (session lifecycle commands → sandbox) ──
  const rabbit = new RabbitMQService(opts.rabbitMQUrl);
  app.decorate('rabbit', rabbit);
  app.decorate('sessionQueue', opts.sessionQueue);
  app.decorate('sessionTTLMins', opts.sessionTTLMins);

  // ── Kafka producer (for potential future emits) ──
  const kafka = new MessagingService('core-service');
  app.decorate('kafka', kafka);

  // ── Auth Guard ──
  app.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
    try {
      await request.jwtVerify();
    } catch (err) {
      app.log.warn({ err }, 'Unauthorized access attempt');
      reply.code(401).send({ error: 'Unauthorized' });
    }
  });

  // ══════════════════════════════════════════════════════════════════
  // Routes
  // ══════════════════════════════════════════════════════════════════

  // Content: DAG nodes, graph traversal, frontier
  // Registered at both root (Kong strip_path=true) and /api/content (direct/tests)
  await app.register(nodeRoutes);
  await app.register(nodeRoutes, { prefix: '/api/content' });

  // Content: Quiz routes (DB-backed, replaces standalone quiz-service)
  await app.register(quizRoutes);
  await app.register(quizRoutes, { prefix: '/api/content' });

  // Challenge: CRUD + session lifecycle
  // Registered at /api for Kong (strip_path=false) and direct access
  await app.register(challengeRoutes, { prefix: '/api' });

  // ══════════════════════════════════════════════════════════════════
  // Health (top-level)
  // ══════════════════════════════════════════════════════════════════
  app.get('/health', async () => ({
    status: 'ok',
    service: 'core-service',
    timestamp: new Date().toISOString(),
  }));

  // ══════════════════════════════════════════════════════════════════
  // Background Initialization (Graceful Degradation)
  // ══════════════════════════════════════════════════════════════════
  app.addHook('onReady', async () => {
    // RabbitMQ
    rabbit.init()
      .then(() => app.log.info('Connected to RabbitMQ'))
      .catch((err) => app.log.error({ err: err.message }, 'RabbitMQ connection failed'));

    // Database
    prisma.$connect()
      .then(() => app.log.info('Connected to Database'))
      .catch((err) => app.log.error({ err: err.message }, 'Database connection failed'));

    // Kafka producer + consumers
    kafka.initProducer()
      .then(async () => {
        app.log.info('Kafka producer initialized');
        await registerProgressConsumers(app);
        await registerNotificationConsumers(app);
      })
      .catch((err) => app.log.error({ err: err.message }, 'Kafka initialization failed'));
  });

  // ══════════════════════════════════════════════════════════════════
  // Error Handler
  // ══════════════════════════════════════════════════════════════════
  app.setErrorHandler(function (error, request, reply) {
    try {
      this.log.error({ err: error, method: request.method, url: request.url }, 'Unhandled error');
    } catch (_) {}
    reply.send(error);
  });

  // ══════════════════════════════════════════════════════════════════
  // Graceful Shutdown
  // ══════════════════════════════════════════════════════════════════
  app.addHook('onClose', async () => {
    await prisma.$disconnect();
    await rabbit.disconnect();
    await kafka.disconnect();
  });

  return app;
}
