import { randomUUID } from 'crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { SessionStartedEvent, SessionEndedEvent } from '@devops/messaging';

export async function challengeRoutes(fastify: FastifyInstance) {

  /**
   * GET /challenges — List all challenges with module info.
   */
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

  /**
   * GET /challenges/:id — Get challenge details with module and learning path.
   */
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

  /**
   * POST /challenges/:id/start — Start a challenge session.
   * Creates a LabSession and publishes session.started to RabbitMQ.
   */
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

    const sessionId = randomUUID();

    await fastify.prisma.labSession.create({
      data: {
        id: sessionId,
        userId: user.sub,
        challengeId: challenge.id,
        status: 'ACTIVE',
      },
    });

    try {
      await fastify.rabbit.publish(
        fastify.sessionQueue,
        new SessionStartedEvent({
          type: 'session.started',
          sessionId,
          userId: user.sub,
          challengeId: challenge.id,
          image: challenge.dockerImage,
          ttlMins: fastify.sessionTTLMins,
        })
      );
    } catch (err) {
      fastify.log.warn({ err: (err as any)?.message ?? err }, 'Failed to publish session.started event — continuing');
    }

    return reply.code(201).send({
      sessionId,
      challengeId: challenge.id,
      challengeTitle: challenge.title,
      terminalUrl: `ws://localhost:8000/sessions/${sessionId}/terminal`,
      validateUrl: `http://localhost:8000/validate/${sessionId}`,
      ttlMins: fastify.sessionTTLMins,
    });
  });

  /**
   * DELETE /session/:id — Terminate an active session.
   * Publishes session.ended to RabbitMQ.
   */
  fastify.delete('/session/:id', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { id: sessionId } = req.params as { id: string };

    await fastify.prisma.labSession.updateMany({
      where: { id: sessionId, status: 'ACTIVE' },
      data: { status: 'TERMINATED', endedAt: new Date() },
    });

    try {
      await fastify.rabbit.publish(
        fastify.sessionQueue,
        new SessionEndedEvent({
          type: 'session.ended',
          sessionId,
          reason: 'user_left',
        })
      );
    } catch (err) {
      fastify.log.warn({ err: (err as any)?.message ?? err }, 'Failed to publish session.ended event — continuing');
    }

    return reply.code(204).send();
  });

  /**
   * GET /session/:id — Get session status and connection URLs.
   */
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
      terminalUrl: `ws://localhost:8000/sessions/${session.id}/terminal`,
      validateUrl: `http://localhost:8000/validate/${session.id}`,
      startedAt: session.startedAt,
    });
  });
}
