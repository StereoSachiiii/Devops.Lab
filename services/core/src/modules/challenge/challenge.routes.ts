import { randomUUID } from 'crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { SessionStartedEvent, SessionEndedEvent, SessionEndReason, QUEUES } from '@devops/messaging';

export async function challengeRoutes(fastify: FastifyInstance) {
  const getGatewayUrls = (sessionId: string) => {
    const gatewayUrl = process.env.PUBLIC_GATEWAY_URL || 'http://localhost:8000';
    const cleanUrl = gatewayUrl.endsWith('/') ? gatewayUrl.slice(0, -1) : gatewayUrl;
    const wsProto = cleanUrl.startsWith('https://') ? 'wss://' : 'ws://';
    const hostPart = cleanUrl.replace(/^https?:\/\//, '');
    return {
      terminalUrl: `${wsProto}${hostPart}/sessions/${sessionId}/terminal`,
      validateUrl: `${cleanUrl}/validate/${sessionId}`,
    };
  };


  fastify.get('/challenges', async (_req, reply) => {
    const challenges = await fastify.prisma.challenge.findMany({
      select: {
        id: true,
        title: true,
        description: true,
        difficulty: true,
        category: true,
        tags: true,
        xp: true,
        module: { select: { title: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return reply.send(challenges);
  });

  fastify.get('/challenges/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const challenge = await fastify.prisma.challenge.findUnique({
      where: { id },
      include: { module: { select: { title: true, path: { select: { title: true } } } } },
    });
    if (!challenge) {
      fastify.log.info({ id }, 'Challenge not found');
      return reply.code(404).send({ error: 'Challenge not found', code: 'NOT_FOUND' });
    }
    return reply.send(challenge);
  });

  fastify.post('/challenges/:id/start', { preHandler: [fastify.authenticate] }, async (req: FastifyRequest, reply) => {
    const user = req.user as { sub: string };
    const { id } = req.params as { id: string };

    const challenge = await fastify.prisma.challenge.findUnique({
      where: { id },
      select: { id: true, dockerImage: true, title: true },
    });
    if (!challenge) {
      fastify.log.warn({ id, userId: user?.sub ?? null }, 'Start failed: challenge not found');
      return reply.code(404).send({ error: 'Challenge not found', code: 'NOT_FOUND' });
    }

    // 1. ATOMIC IDEMPOTENCY CHECK via Redis SET NX
    // SET NX is atomic — eliminates the race window between GET and SET.
    // If the key already exists, SET returns null (another request won the race).
    const lockKey = `core:session:${user.sub}:${challenge.id}`;
    const sessionId = randomUUID();
    const acquired = await fastify.redis.set(lockKey, sessionId, 'EX', fastify.sessionTTLMins * 60, 'NX');

    if (!acquired) {
      // Lock already held — fetch the existing session ID and return it
      const cachedSessionId = await fastify.redis.get(lockKey);
      if (cachedSessionId) {
        fastify.log.info({ sessionId: cachedSessionId }, 'Returning cached active session from Redis (NX collision)');
        return reply.code(200).send({
          sessionId: cachedSessionId,
          challengeId: challenge.id,
          challengeTitle: challenge.title,
          ...getGatewayUrls(cachedSessionId),
          ttlMins: fastify.sessionTTLMins,
        });
      }
      // Key disappeared between SET NX and GET (expired in <1ms) — fall through and create a new session
    }

    // 2. OUTBOX PATTERN: Write the event + session atomically in one DB transaction.
    // Even if the brokers are temporarily down, the OutboxEvent row survives and
    // the outbox poller will deliver it on recovery.
    const outboxPayload = {
      type: 'session.started' as const,
      sessionId,
      userId: user.sub,
      challengeId: challenge.id,
      image: challenge.dockerImage,
      ttlMins: fastify.sessionTTLMins,
    };

    try {
      await fastify.prisma.$transaction([
        fastify.prisma.labSession.create({
          data: {
            id: sessionId,
            userId: user.sub,
            challengeId: challenge.id,
            status: 'ACTIVE',
          },
        }),
        fastify.prisma.outboxEvent.create({
          data: {
            eventType: 'SessionStartedEvent',
            payload: outboxPayload as any,
          },
        }),
      ]);
    } catch (err) {
      fastify.log.error({ err: (err as any)?.message ?? err }, 'DB transaction failed — rolling back lock');
      await fastify.redis.del(lockKey);
      return reply.code(500).send({ error: 'Failed to create session. Please try again later.' });
    }

    // 3. BEST-EFFORT broker emission after the transaction commits.
    // If this fails the OutboxEvent poller will retry delivery automatically.
    try {
      await fastify.kafka.emit(new SessionStartedEvent(outboxPayload));
      await fastify.rabbitmq.publish(QUEUES.PROVISION_SANDBOX, outboxPayload);

      // Mark the outbox event as processed since we published inline successfully
      await fastify.prisma.outboxEvent.updateMany({
        where: { eventType: 'SessionStartedEvent', payload: { equals: outboxPayload as any }, processed: false },
        data: { processed: true },
      });
    } catch (err) {
      // Non-fatal: outbox poller will pick this up and retry
      fastify.log.warn({ err: (err as any)?.message ?? err }, 'Broker emit failed — outbox poller will retry');
    }

    fastify.metrics.sessionStartCounter.inc({ challengeId: challenge.id });

    return reply.code(201).send({
      sessionId,
      challengeId: challenge.id,
      challengeTitle: challenge.title,
      ...getGatewayUrls(sessionId),
      ttlMins: fastify.sessionTTLMins,
    });
  });

  fastify.delete('/session/:id', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { id: sessionId } = req.params as { id: string };

    await fastify.prisma.labSession.updateMany({
      where: { id: sessionId, status: 'ACTIVE' },
      data: { status: 'TERMINATED', endedAt: new Date() },
    });

    try {
      const payload = {
        type: 'session.ended' as const,
        sessionId,
        reason: SessionEndReason.TERMINATED,
      };
      
      await fastify.kafka.emit(new SessionEndedEvent(payload));
      await fastify.rabbitmq.publish(QUEUES.TERMINATE_SANDBOX, payload);
    } catch (err) {
      fastify.log.warn({ err: (err as any)?.message ?? err }, 'Failed to emit session.ended event — continuing');
    }

    fastify.metrics.sessionEndCounter.inc({ reason: SessionEndReason.TERMINATED });

    return reply.code(204).send();
  });

  fastify.get('/session/:id', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const session = await fastify.prisma.labSession.findUnique({
      where: { id },
      include: { challenge: { select: { title: true } } },
    });
    if (!session) return reply.code(404).send({ error: 'Session not found', code: 'NOT_FOUND' });

    return reply.send({
      sessionId: session.id,
      status: session.status,
      challengeTitle: session.challenge.title,
      ...getGatewayUrls(session.id),
      startedAt: session.startedAt,
    });
  });
}
