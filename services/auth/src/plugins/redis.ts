import fp from 'fastify-plugin';
import fastifyRedis from '@fastify/redis';
import type { FastifyInstance } from 'fastify';

export const redisPlugin = fp(async (fastify: FastifyInstance) => {
  const redisUrl = process.env['REDIS_URL'] || 'redis://localhost:6379';
  
  await fastify.register(fastifyRedis, {
    url: redisUrl,
  });

  fastify.log.info({ url: redisUrl }, 'Redis client connected');
});
