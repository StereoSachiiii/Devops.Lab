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
    lazyConnect: true, 
    enableOfflineQueue: true,
    maxRetriesPerRequest: null, 
    retryStrategy: (times) => {
      const delay = Math.min(times * 100, 3000);
      return delay;
    },
  });

 
  redis.on('connect', () => fastify.log.info('Redis connected'));
  redis.on('error', (err) => {
    
    fastify.log.warn({ err: err.message }, 'Redis connection issue');
  });

  
  fastify.decorate('redis', redis);

  
  redis.connect().catch((err) => {
    fastify.log.error({ err: err.message }, 'Redis background connection failed');
  });

  fastify.addHook('onClose', async () => {
    await redis.quit();
  });
});
