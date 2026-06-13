import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@devops/db';
import type { MessagingService } from '@devops/messaging';

export interface HealthCheckResult {
  status: 'ok' | 'degraded';
  service: string;
  checks: Record<string, 'up' | 'down'>;
  timestamp: string;
}

export type HealthChecker = () => Promise<void>;

// Cache results to avoid hammering dependencies (Neon charges per connection)
export class HealthRegistry {
  private checks = new Map<string, HealthChecker>();
  private cache: HealthCheckResult | null = null;
  private cacheExpiry = 0;

  constructor(private cacheTtlMs: number = 30_000) {}

  register(name: string, checker: HealthChecker): void {
    this.checks.set(name, checker);
  }

  clearCache(): void {
    this.cache = null;
    this.cacheExpiry = 0;
  }

  async run(serviceName: string): Promise<HealthCheckResult> {
    const now = Date.now();

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

export function databaseCheck(prisma: PrismaClient): HealthChecker {
  return async () => {
    await prisma.$queryRaw`SELECT 1`;
  };
}

export function kafkaCheck(kafka: MessagingService): HealthChecker {
  return async () => {
    if (!kafka.isProducerReady) {
      throw new Error('Kafka producer not ready');
    }
  };
}

declare module 'fastify' {
  interface FastifyInstance {
    healthRegistry: HealthRegistry;
  }
}

export function registerHealthChecks(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  kafka: MessagingService,
): void {
  const registry = new HealthRegistry();

  registry.register('db', databaseCheck(prisma));
  registry.register('kafka', kafkaCheck(kafka));

  fastify.decorate('healthRegistry', registry);

  fastify.get('/health', async (_req, reply) => {
    const result = await registry.run('core-service');
    if (result.status === 'degraded') {
      reply.status(503);
    }
    return result;
  });
}
