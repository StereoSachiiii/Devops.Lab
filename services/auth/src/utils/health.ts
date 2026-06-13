import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@devops/db';
import type { Redis } from 'ioredis';

export interface HealthCheckResult {
  status: 'ok' | 'degraded';
  service: string;
  checks: Record<string, 'up' | 'down'>;
  timestamp: string;
}

export type HealthChecker = () => Promise<void>;

/**
 * Creates a health check registry for the service.
 * Each checker throws on failure, succeeds otherwise.
 *
 * Results are cached to avoid hammering dependencies (especially important
 * for serverless databases like Neon that charge per connection/active time).
 */
export class HealthRegistry {
  private checks = new Map<string, HealthChecker>();
  private cache: HealthCheckResult | null = null;
  private cacheExpiry = 0;

  /** How long to cache health check results (ms). Default: 30s */
  constructor(private cacheTtlMs: number = 30_000) {}

  register(name: string, checker: HealthChecker): void {
    this.checks.set(name, checker);
  }

  async run(serviceName: string): Promise<HealthCheckResult> {
    const now = Date.now();

    // Return cached result if still fresh
    if (this.cache && now < this.cacheExpiry) {
      return this.cache;
    }

    const checks: Record<string, 'up' | 'down'> = {};

    await Promise.all(
      Array.from(this.checks.entries()).map(async ([name, checker]) => {
        try {
          await checker();
          checks[name] = 'up';
        } catch {
          checks[name] = 'down';
        }
      }),
    );

    const allUp = Object.values(checks).every((v) => v === 'up');

    this.cache = {
      status: allUp ? 'ok' : 'degraded',
      service: serviceName,
      checks,
      timestamp: new Date().toISOString(),
    };
    this.cacheExpiry = now + this.cacheTtlMs;

    return this.cache;
  }
}

// ── Built-in checkers ────────────────────────────────────────────────────────

export function redisCheck(redis: Redis): HealthChecker {
  return async () => {
    await redis.ping();
  };
}

export function databaseCheck(prisma: PrismaClient): HealthChecker {
  return async () => {
    await prisma.$queryRaw`SELECT 1`;
  };
}

// ── Fastify integration ──────────────────────────────────────────────────────

declare module 'fastify' {
  interface FastifyInstance {
    healthRegistry: HealthRegistry;
  }
}

/**
 * Registers the health check system on the Fastify instance.
 * Call this once during app setup, then add checks via fastify.healthRegistry.register().
 */
export function registerHealthChecks(fastify: FastifyInstance, prisma: PrismaClient): void {
  const registry = new HealthRegistry();

  // Access dependencies lazily — they may not be decorated yet at registration time
  registry.register('redis', async () => { await fastify.redis.ping(); });
  registry.register('db', databaseCheck(prisma));

  fastify.decorate('healthRegistry', registry);

  fastify.get('/health', async (_req, reply) => {
    const result = await registry.run('auth-service');
    if (result.status === 'degraded') {
      reply.status(503);
    }
    return result;
  });
}
