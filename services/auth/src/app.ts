import Fastify from 'fastify';
import cors from '@fastify/cors';
import dotenv from 'dotenv';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { OAuth2Namespace } from '@fastify/oauth2';
import type { MessagingService } from '@devops/messaging';
import { authPlugin } from './plugins/auth.js';
import { authRoutes } from './routes/auth.js';
import { oauthRoutes } from './routes/oauth.js';

dotenv.config();

// ── Module augmentation — all decorators declared in one place ──────────────
declare module 'fastify' {
  interface FastifyInstance {
    github: OAuth2Namespace;
    google: OAuth2Namespace;
    messaging: MessagingService;
  }
}

export function buildApp() {
  const fastify = Fastify({
    logger: process.env['NODE_ENV'] === 'test' ? false : true,
  }).withTypeProvider<TypeBoxTypeProvider>();

  fastify.register(cors);

  // Plugins first — JWT, cookies, OAuth, Kafka
  fastify.register(authPlugin);

  // Routes
  fastify.register(authRoutes);
  fastify.register(oauthRoutes);

  return fastify;
}
