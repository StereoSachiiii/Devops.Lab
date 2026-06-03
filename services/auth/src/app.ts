import Fastify from 'fastify';
import cors from '@fastify/cors';
import dotenv from 'dotenv';
import path from 'path';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { ObservabilityConfig } from '@devops/observability';
import type { OAuth2Namespace } from '@fastify/oauth2';
import pino from 'pino';

// ── Plugins ───────────────────────────────────────────────────────────────────
import { jwtPlugin }       from './plugins/jwt';
import { oauth2Plugin }    from './plugins/oauth2';
import { messagingPlugin } from './plugins/messaging';
import { redisPlugin }     from './plugins/redis';
import { outboxPlugin }    from './plugins/outbox';
import { metricsPlugin }   from './plugins/metrics';

// ── Routes ────────────────────────────────────────────────────────────────────
import { accountRoutes } from './routes/account';
import { mfaRoutes }     from './routes/mfa';
import { oauthRoutes }   from './routes/oauth';

// ─── Environment setup ────────────────────────────────────────────────────────
// Load the monorepo root .env first (JWT keys, Loki URL, etc.), then overlay
// the service-specific .env for anything auth-service-only.

dotenv.config({ path: path.resolve(__dirname, '../../../.env'), override: false });
dotenv.config({ path: path.resolve(__dirname, '../.env'),        override: false });

// OAuth2 providers register `fastify.github` / `fastify.google` at runtime.
declare module 'fastify' {
  interface FastifyInstance {
    github: OAuth2Namespace;
    google: OAuth2Namespace;
  }
}

// ─── App builder ──────────────────────────────────────────────────────────────

export function buildApp(obs: ObservabilityConfig) {
  const isTest = process.env['NODE_ENV'] === 'test';

  const fastify = Fastify({
    ...(isTest
      ? { logger: false }
      : { logger: pino(obs.loggerOptions, obs.stream as any) }),
    requestIdHeader:    'x-request-id',
    requestIdLogLabel:  'request_id',
    genReqId: (req) => (req.headers['x-request-id'] as string) ?? crypto.randomUUID(),
  }).withTypeProvider<TypeBoxTypeProvider>();

  // ── CORS ────────────────────────────────────────────────────────────────────

  const corsOrigins = (process.env['CORS_ORIGIN'] ?? 'http://localhost:3000,http://127.0.0.1:3000')
    .split(',')
    .map((o) => o.trim());

  fastify.register(cors, { origin: corsOrigins, credentials: true });

  // ── Infrastructure plugins (order matters: JWT before routes) ────────────────

  fastify.register(jwtPlugin);
  fastify.register(oauth2Plugin);
  fastify.register(messagingPlugin);
  fastify.register(redisPlugin);
  fastify.register(outboxPlugin);
  fastify.register(metricsPlugin);

  // ── Routes ──────────────────────────────────────────────────────────────────

  fastify.register(accountRoutes);
  fastify.register(mfaRoutes);
  fastify.register(oauthRoutes);

  // ── Centralized error handler ───────────────────────────────────────────────
  // Catches unhandled errors from all routes. Returns structured responses
  // without leaking internal details (connection strings, stack traces, etc.).

  fastify.setErrorHandler(function (error, request, reply) {
    try {
      this.log.error({ err: error, method: request.method, url: request.url }, 'Unhandled error');
    } catch {
      // swallow logging failures
    }

    const status = error.statusCode ?? 500;

    // Let known client-facing errors through as-is (validation, auth, etc.)
    if (status >= 400 && status < 500) {
      return reply.send(error);
    }

    // For 5xx or unknown errors, return a safe generic response.
    // This prevents leaking Redis/DB connection errors to the client.
    return reply.status(status).send({
      statusCode: status,
      error:    status === 503 ? 'Service Unavailable' : 'Internal Server Error',
      message:  'An unexpected error occurred. Please try again later.',
    });
  });

  return fastify;
}
