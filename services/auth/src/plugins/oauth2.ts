import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import oauth2 from '@fastify/oauth2';


export const oauth2Plugin = fp(async (fastify: FastifyInstance) => {
  const required = (key: string): string => {
    const v = process.env[key];
    if (!v) throw new Error(`Missing required environment variable: ${key}`);
    return v;
  };

  const baseUrl = required('BASE_URL');

  await fastify.register(oauth2, {
    name: 'github',
    credentials: {
      client: {
        id:     required('GITHUB_CLIENT_ID'),
        secret: required('GITHUB_CLIENT_SECRET'),
      },
      auth: oauth2.GITHUB_CONFIGURATION,
    },
    startRedirectPath: '/login/github',
    callbackUri:       `${baseUrl}/login/github/callback`,
    scope:             ['user:email'],
  });

  await fastify.register(oauth2, {
    name: 'google',
    credentials: {
      client: {
        id:     required('GOOGLE_CLIENT_ID'),
        secret: required('GOOGLE_CLIENT_SECRET'),
      },
      auth: oauth2.GOOGLE_CONFIGURATION,
    },
    startRedirectPath: '/login/google',
    callbackUri:       `${baseUrl}/login/google/callback`,
    scope:             ['profile', 'email'],
  });
});
