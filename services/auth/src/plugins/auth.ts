import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
import oauth2 from '@fastify/oauth2';
import { MessagingService } from '@devops/messaging';

import crypto from 'crypto';

export const authPlugin = fp(async (fastify: FastifyInstance) => {
  await fastify.register(cookie);

  let privateKey = process.env['JWT_PRIVATE_KEY'];
  let publicKey = process.env['JWT_PUBLIC_KEY'];

  if (!privateKey || !publicKey) {
    const { privateKey: priv, publicKey: pub } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    privateKey = priv;
    publicKey = pub;
  }

  fastify.decorate('jwtPublicKey', publicKey);

  await fastify.register(jwt, {
    secret: {
      private: privateKey,
      public: publicKey,
    },
    sign: {
      algorithm: 'RS256',
      expiresIn: '15m', // Access token expires in 15 minutes
    },
    cookie: {
      cookieName: 'token',
      signed: false,
    },
  });

  const messaging = new MessagingService();
  fastify.decorate('messaging', messaging);

  fastify.addHook('onReady', async () => {
    await messaging.initProducer();
    fastify.log.info('🚀 Kafka Messaging Ready');
  });

  fastify.addHook('onClose', async () => {
    await messaging.disconnect();
  });

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
