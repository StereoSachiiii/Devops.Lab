declare module 'fastify' {
  interface FastifyInstance {
    prisma: import('@devops/db').PrismaClient;
    kafka: import('@devops/messaging').MessagingService;
    rabbitmq: import('@devops/messaging').RabbitMQService;
    sessionTTLMins: number;
    authenticate: (request: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: {
      sub: string;
      id: string;
      email: string;
      role: string;
    };
  }
}
