import Fastify from 'fastify';
import cors from '@fastify/cors';
import dotenv from 'dotenv';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { logger } from '@devops/observability';
import type { OAuth2Namespace } from '@fastify/oauth2';
import type { MessagingService } from '@devops/messaging';
import { authPlugin } from './plugins/auth.js';
import { redisPlugin } from './plugins/redis.js';
import { authRoutes } from './routes/auth.js';
import { oauthRoutes } from './routes/oauth.js';

dotenv.config();

declare module 'fastify' {
  interface FastifyInstance {
    github: OAuth2Namespace;
    google: OAuth2Namespace;
    messaging: MessagingService;
    redis: import('@fastify/redis').FastifyRedis;
  }
}

export function buildApp() {
  const fastify = Fastify({
    logger: process.env['NODE_ENV'] === 'test' ? false : logger,
  }).withTypeProvider<TypeBoxTypeProvider>();

  fastify.register(cors);

  // Plugins first JWT, cookies, OAuth, Kafka, Redis
  fastify.register(authPlugin);
  fastify.register(redisPlugin);

  // Routes
  fastify.register(authRoutes);
  fastify.register(oauthRoutes);

  return fastify;
}
