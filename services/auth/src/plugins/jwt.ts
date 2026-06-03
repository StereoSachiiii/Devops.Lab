import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';

/**
 * JWT + Cookie plugin.
 *
 * Reads RSA key-pair from environment, registers @fastify/jwt (RS256, 15-min
 * access tokens) and @fastify/cookie, and exposes `fastify.jwtPublicKey` so
 * other services can verify tokens issued by this one.
 */
export const jwtPlugin = fp(async (fastify: FastifyInstance) => {
  await fastify.register(cookie);

  const privateKey = process.env['JWT_PRIVATE_KEY'];
  const publicKey  = process.env['JWT_PUBLIC_KEY'];

  if (!privateKey || !publicKey) {
    fastify.log.error(
      { hasPrivate: Boolean(privateKey), hasPublic: Boolean(publicKey) },
      'JWT_PRIVATE_KEY / JWT_PUBLIC_KEY must be set. Auth service will not start.',
    );
    throw new Error('Auth service misconfigured: missing JWT key-pair');
  }

  fastify.decorate('jwtPublicKey', publicKey);

  await fastify.register(jwt, {
    secret:  { private: privateKey, public: publicKey },
    sign:    { algorithm: 'RS256', expiresIn: '15m' },
    cookie:  { cookieName: 'token', signed: false },
  });
});
