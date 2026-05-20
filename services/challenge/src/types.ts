import { PrismaClient } from '@devops/db';
import { RabbitMQService } from '@devops/messaging';
import type { FastifyRequest, FastifyReply } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
    rabbit: RabbitMQService;
    sessionQueue: string;
    sessionTTLMins: number;
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
