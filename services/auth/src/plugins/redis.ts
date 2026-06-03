import fp from 'fastify-plugin';
import Redis from 'ioredis';
import type { FastifyInstance } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis;
  }
}

export const redisPlugin = fp(async (fastify: FastifyInstance) => {
  const redisUrl = process.env['REDIS_URL'] || 'redis://127.0.0.1:6379';

  const redis = new Redis(redisUrl, {
    lazyConnect: true, // Do not connect on instantiation
    enableOfflineQueue: true,
    maxRetriesPerRequest: null, // Essential: prevents crash after too many failed retries
    retryStrategy: (times) => {
      const delay = Math.min(times * 100, 3000);
      return delay;
    },
  });

  // Event listeners for logging
  redis.on('connect', () => fastify.log.info('Redis connected'));
  redis.on('error', (err) => {
    // We log as warn so it doesn't look like a fatal crash
    fastify.log.warn({ err: err.message }, 'Redis connection issue');
  });

  // Decorate immediately so other plugins can access the object
  fastify.decorate('redis', redis);

  // Attempt connection in the background without 'await'
  redis.connect().catch((err) => {
    fastify.log.error({ err: err.message }, 'Redis background connection failed');
  });

  fastify.addHook('onClose', async () => {
    await redis.quit();
  });
});
