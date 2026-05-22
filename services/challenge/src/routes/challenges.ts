import { randomUUID } from 'crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { SessionStartedEvent, SessionEndedEvent } from '@devops/messaging';
import '../types.js';

type App = FastifyInstance & ReturnType<typeof Object.create>;

export async function challengeRoutes(app: FastifyInstance) {
  const a = app as App;

  // ── GET /api/challenges ───────────────────────────────────────────────────
  app.get('/challenges', async (_req, reply) => {
    const challenges = await a.prisma.challenge.findMany({
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

  // ── GET /api/challenges/:id ───────────────────────────────────────────────
  app.get('/challenges/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const challenge = await a.prisma.challenge.findUnique({
      where: { id },
      include: { module: { select: { title: true, path: { select: { title: true } } } } },
    });
    if (!challenge) return reply.code(404).send({ error: 'Challenge not found' });
    return reply.send(challenge);
  });

  // ── POST /api/challenges/:id/start ───────────────────────────────────────
  app.post('/challenges/:id/start', { preHandler: [app.authenticate] }, async (req: FastifyRequest, reply) => {
    const user = req.user as { sub: string };
    const { id } = req.params as { id: string };

    const challenge = await a.prisma.challenge.findUnique({
      where: { id },
      select: { id: true, dockerImage: true, title: true },
    });
    if (!challenge) return reply.code(404).send({ error: 'Challenge not found' });

    const sessionId = randomUUID();

    await a.prisma.labSession.create({
      data: {
        id: sessionId,
        userId: user.sub,
        challengeId: challenge.id,
        status: 'ACTIVE',
      },
    });

    await a.rabbit.publish(
      a.sessionQueue,
      new SessionStartedEvent({
        type: 'session.started',
        sessionId,
        userId: user.sub,
        challengeId: challenge.id,
        image: challenge.dockerImage,
        ttlMins: a.sessionTTLMins,
      })
    );

    return reply.code(201).send({
      sessionId,
      challengeId: challenge.id,
      challengeTitle: challenge.title,
      terminalUrl: `ws://localhost:8000/sessions/${sessionId}/terminal`,
      validateUrl: `http://localhost:8000/validate/${sessionId}`,
      ttlMins: a.sessionTTLMins,
    });
  });

  // ── DELETE /api/sessions/:id ──────────────────────────────────────────────
  app.delete('/sessions/:id', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id: sessionId } = req.params as { id: string };

    await a.prisma.labSession.updateMany({
      where: { id: sessionId, status: 'ACTIVE' },
      data: { status: 'TERMINATED', endedAt: new Date() },
    });

    await a.rabbit.publish(
      a.sessionQueue,
      new SessionEndedEvent({
        type: 'session.ended',
        sessionId,
        reason: 'user_left',
      })
    );

    return reply.code(204).send();
  });

  // ── GET /api/sessions/:id ─────────────────────────────────────────────────
  app.get('/sessions/:id', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const session = await a.prisma.labSession.findUnique({
      where: { id },
      include: { challenge: { select: { title: true } } },
    });
    if (!session) return reply.code(404).send({ error: 'Session not found' });

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
