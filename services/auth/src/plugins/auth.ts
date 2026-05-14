import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
import oauth2 from '@fastify/oauth2';
import { MessagingService } from '@devops/messaging';

/**
 * Registers all core auth plugins:
 *  - @fastify/cookie
 *  - @fastify/jwt
 *  - @fastify/oauth2 (GitHub + Google)
 *  - MessagingService (Kafka producer)
 */
export const authPlugin = fp(async (fastify: FastifyInstance) => {
  // ── Cookies ────────────────────────────────────────────────────────────────
  await fastify.register(cookie);

  // ── JWT ────────────────────────────────────────────────────────────────────
  await fastify.register(jwt, {
    secret: process.env['JWT_SECRET'] || 'super-secret-development-key',
    sign: {
      expiresIn: '7d',
    },
    cookie: {
      cookieName: 'token',
      signed: false,
    },
  });

  // ── Kafka Messaging ────────────────────────────────────────────────────────
  const messaging = new MessagingService();
  fastify.decorate('messaging', messaging);

  fastify.addHook('onReady', async () => {
    await messaging.initProducer();
    fastify.log.info('🚀 Kafka Messaging Ready');
  });

  fastify.addHook('onClose', async () => {
    await messaging.disconnect();
  });

  // ── GitHub OAuth ───────────────────────────────────────────────────────────
  await fastify.register(oauth2, {
    name: 'github',
    credentials: {
      client: {
        id: process.env['GITHUB_CLIENT_ID'] || '',
        secret: process.env['GITHUB_CLIENT_SECRET'] || '',
      },
      auth: oauth2.GITHUB_CONFIGURATION,
    },
    startRedirectPath: '/login/github',
    callbackUri: `${process.env['BASE_URL'] || 'http://localhost:3002'}/login/github/callback`,
    scope: ['user:email'],
  });

  // ── Google OAuth ───────────────────────────────────────────────────────────
  await fastify.register(oauth2, {
    name: 'google',
    credentials: {
      client: {
        id: process.env['GOOGLE_CLIENT_ID'] || '',
        secret: process.env['GOOGLE_CLIENT_SECRET'] || '',
      },
      auth: oauth2.GOOGLE_CONFIGURATION,
    },
    startRedirectPath: '/login/google',
    callbackUri: `${process.env['BASE_URL'] || 'http://localhost:3002'}/login/google/callback`,
    scope: ['profile', 'email'],
  });
});
