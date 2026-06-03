declare module 'fastify' {
  interface FastifyInstance {
    prisma: import('@devops/db').PrismaClient;
    rabbit: import('@devops/messaging').RabbitMQService;
    kafka: import('@devops/messaging').MessagingService;
    sessionQueue: string;
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
