import Fastify, { FastifyRequest, FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { PrismaClient } from '@devops/db';
import { RabbitMQService } from '@devops/messaging';
import { challengeRoutes } from './routes/challenges';
import type { MultiStreamRes, LoggerOptions } from 'pino';
import './types';

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

  // JWT Config
  await app.register(jwt, {
    secret: {
      private: '', 
      public: opts.jwtPublicKey,
    },
    verify: { algorithms: ['RS256'] },
  });

  // Database
  const prisma = new PrismaClient();
  app.decorate('prisma', prisma);

  // RabbitMQ
  const rabbit = new RabbitMQService(opts.rabbitMQUrl);
  app.decorate('rabbit', rabbit);
  app.decorate('sessionQueue', opts.sessionQueue);
  app.decorate('sessionTTLMins', opts.sessionTTLMins);

  // Auth Guard - Explicitly typed to avoid "Unexpected Fastify" error
  app.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
    try {
      await request.jwtVerify();
    } catch (err) {
      app.log.warn({ err }, 'Unauthorized access attempt');
      reply.code(401).send({ error: 'Unauthorized' });
    }
  });

  // Background initialization (Graceful Degradation)
  app.addHook('onReady', async () => {
    rabbit.init()
      .then(() => app.log.info('Connected to RabbitMQ'))
      .catch((err) => app.log.error({ err: err.message }, 'RabbitMQ connection failed - retrying in background'));

    prisma.$connect()
      .then(() => app.log.info('Connected to Database'))
      .catch((err) => app.log.error({ err: err.message }, 'Database connection failed - retrying in background'));
  });

  await app.register(challengeRoutes, { prefix: '/api' });

  app.get('/health', async () => ({
    status: 'ok',
    service: 'challenge-service',
    timestamp: new Date().toISOString()
  }));

  app.addHook('onClose', async () => {
    await prisma.$disconnect();
    await rabbit.disconnect();
  });

  return app;
}
