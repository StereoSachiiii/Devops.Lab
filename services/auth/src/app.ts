import Fastify from 'fastify';
import cors from '@fastify/cors';
import dotenv from 'dotenv';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { ObservabilityConfig } from '@devops/observability';
import type { OAuth2Namespace } from '@fastify/oauth2';
import type { MessagingService } from '@devops/messaging';
import { authPlugin } from './plugins/auth';
import { redisPlugin } from './plugins/redis';
import { outboxPlugin } from './plugins/outbox';
import { authRoutes } from './routes/auth';
import { oauthRoutes } from './routes/oauth';

dotenv.config();

declare module 'fastify' {
  interface FastifyInstance {
    github: OAuth2Namespace;
    google: OAuth2Namespace;
    messaging: MessagingService;
    redis: import('@fastify/redis').FastifyRedis;
    jwtPublicKey: string;
  }
}

export function buildApp(obs: ObservabilityConfig) {
  const isTest = process.env['NODE_ENV'] === 'test';

  const fastify = Fastify({
    ...(isTest
      ? { logger: false }
      : {
          logger: obs.loggerOptions,
          stream: obs.stream,
        }),
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'request_id',
    genReqId: (req) =>
      (req.headers['x-request-id'] as string) ?? crypto.randomUUID(),
  }).withTypeProvider<TypeBoxTypeProvider>();

  fastify.register(cors);

  // Plugins: JWT, cookies, OAuth, Kafka, Redis
  fastify.register(authPlugin);
  fastify.register(redisPlugin);
  fastify.register(outboxPlugin);

  // Routes
  fastify.register(authRoutes);
  fastify.register(oauthRoutes);

  return fastify;
}
