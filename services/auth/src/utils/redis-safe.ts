import type { FastifyInstance } from "fastify";

/**
 * Executes a Redis GET with a hard timeout.
 * If Redis hangs, disconnects, or errors, it fails open (returns null/default)
 * following the reference 250ms pattern to protect high-throughput auth flows.
 */
export async function redisSafeGet(
  fastify: FastifyInstance,
  key: string,
  timeoutMs: number = 250
): Promise<string | null> {
  if (!fastify.redis) return null;
  try {
    const res = await Promise.race([
      fastify.redis.get(key),
      new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error("Redis get timeout")), timeoutMs)
      ),
    ]);
    return res;
  } catch (err) {
    fastify.log.warn({ key, err: (err as Error).message }, "Redis safe-get timed out or failed, failing open");
    return null;
  }
}

/**
 * Executes a non-critical Redis SET / increment with a timeout and swallows errors.
 */
export async function redisSafeExecute<T>(
  fastify: FastifyInstance,
  operation: () => Promise<T>,
  timeoutMs: number = 250
): Promise<T | null> {
  if (!fastify.redis) return null;
  try {
    const res = await Promise.race([
      operation(),
      new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error("Redis operation timeout")), timeoutMs)
      ),
    ]);
    return res;
  } catch (err) {
    fastify.log.warn({ err: (err as Error).message }, "Redis safe operation timed out or failed");
    return null;
  }
}
