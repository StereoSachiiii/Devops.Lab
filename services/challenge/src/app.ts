import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { PrismaClient } from '@devops/db';
import { RabbitMQService } from '@devops/messaging';
import './types';
import { challengeRoutes } from './routes/challenges';

export interface AppOptions {
  jwtSecret: string;
  rabbitMQUrl: string;
  sessionQueue: string;
  sessionTTLMins: number;
}

export async function buildApp(opts: AppOptions) {
  const app = Fastify({ logger: true }).withTypeProvider<TypeBoxTypeProvider>();

  // ── Plugins ─────────────────────────────────────────────────────────────────
  await app.register(cors, { origin: true });
  await app.register(jwt, { secret: opts.jwtSecret });

  // ── Database ─────────────────────────────────────────────────────────────────
  const prisma = new PrismaClient();
  app.decorate('prisma', prisma);

  // ── RabbitMQ Publisher ────────────────────────────────────────────────────────
  const rabbit = new RabbitMQService(opts.rabbitMQUrl);
  await rabbit.init();
  app.decorate('rabbit', rabbit);
  app.decorate('sessionQueue', opts.sessionQueue);
  app.decorate('sessionTTLMins', opts.sessionTTLMins);

  // ── Auth guard ───────────────────────────────────────────────────────────────
  app.decorate('authenticate', async function (request: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) {
    try {
      await request.jwtVerify();
    } catch {
      reply.code(401).send({ error: 'Unauthorized' });
    }
  });

  // ── Routes ───────────────────────────────────────────────────────────────────
  await app.register(challengeRoutes, { prefix: '/api' });

  // ── Health ───────────────────────────────────────────────────────────────────
  app.get('/health', () => ({ status: 'ok', service: 'challenge-service' }));

  // ── Cleanup ───────────────────────────────────────────────────────────────────
  app.addHook('onClose', async () => {
    await prisma.$disconnect();
    await rabbit.disconnect();
  });

  return app;
}
