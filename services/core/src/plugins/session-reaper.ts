import type { FastifyInstance } from "fastify";
import { SessionEndedEvent, QUEUES, SessionEndReason } from "@devops/messaging";

const POLL_INTERVAL_MS = 60_000; // poll every minute

/**
 * Session Reaper: periodically scans for LabSession rows that are ACTIVE
 * but their startedAt + ttlMins has expired.
 * Automatically terminates them and emits SessionEndedEvent.
 */
export function startSessionReaper(fastify: FastifyInstance): NodeJS.Timeout {
  fastify.log.info("Session reaper started");

  const reap = async () => {
    // Find sessions that have expired based on their startedAt and the global TTL
    // (In a more complex app, TTL might be per-session. Here we use fastify.sessionTTLMins)
    const expirationThreshold = new Date(Date.now() - fastify.sessionTTLMins * 60_000);

    const expiredSessions = await fastify.prisma.labSession.findMany({
      where: {
        status: "ACTIVE",
        startedAt: {
          lt: expirationThreshold,
        },
      },
      select: { id: true, userId: true, challengeId: true },
      take: 50,
    });

    if (expiredSessions.length === 0) return;

    fastify.log.info({ count: expiredSessions.length }, "Session reaper: terminating expired sessions");

    for (const session of expiredSessions) {
      const payload = {
        type: "session.ended" as const,
        sessionId: session.id,
        reason: SessionEndReason.EXPIRED,
      };

      try {
        const [, createdEvent] = await fastify.prisma.$transaction([
          fastify.prisma.labSession.update({
            where: { id: session.id },
            data: { status: "TERMINATED", endedAt: new Date() },
          }),
          fastify.prisma.coreOutboxEvent.create({
            data: {
              eventType: "SessionEndedEvent",
              payload: payload as object,
            },
          }),
        ]);

        // Best effort inline emit
        await fastify.kafka.emit(new SessionEndedEvent(payload));
        await fastify.rabbitmq.publish(QUEUES.TERMINATE_SANDBOX, payload);

        if (createdEvent?.id) {
          await fastify.prisma.coreOutboxEvent.update({
            where: { id: createdEvent.id },
            data: { processed: true },
          });
        }

        fastify.metrics.sessionEndCounter.inc({ reason: SessionEndReason.EXPIRED });
        fastify.log.info({ sessionId: session.id }, "Session reaped successfully");
      } catch (err) {
        fastify.log.error(
          { err, sessionId: session.id },
          "Session reaper: failed to terminate session"
        );
      }
    }
  };

  return setInterval(() => {
    reap().catch((err) => fastify.log.error(err, "Session reaper cycle failed"));
  }, POLL_INTERVAL_MS);
}
