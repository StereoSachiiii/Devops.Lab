import fp from "fastify-plugin";
import { requireEnv } from "@devops/observability";
import Redis from "ioredis";
import type { FastifyInstance } from "fastify";

declare module "fastify" {
  interface FastifyInstance {
    redis: Redis;
  }
}

export const redisPlugin = fp(async (fastify: FastifyInstance) => {
  const redisUrl = requireEnv("REDIS_URL");

  const redis = new Redis(redisUrl, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 3,
    commandTimeout: 2000,
    retryStrategy: (times) => {
      const delay = Math.min(times * 100, 3000);
      return delay;
    },
  });

  redis.on("connect", () => fastify.log.info("Redis connected"));
  redis.on("error", (err) => {
    fastify.log.warn({ err: err instanceof Error ? err.message : String(err) }, "Redis connection issue");
  });

  fastify.decorate("redis", redis);

  redis.connect().catch((err) => {
    fastify.log.error({ err: err instanceof Error ? err.message : String(err) }, "Redis background connection failed");
  });

  fastify.addHook("onClose", async () => {
    await redis.quit();
  });
});
