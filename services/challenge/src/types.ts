import { PrismaClient } from '@devops/db';
import { RabbitMQService } from '@devops/messaging';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
    rabbit: RabbitMQService;
    sessionQueue: string;
    sessionTTLMins: number;
    authenticate: (request: any, reply: any) => Promise<void>;
  }
}
