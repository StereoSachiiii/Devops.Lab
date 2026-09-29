import type { FastifyInstance } from "fastify";
import { SessionEndedEvent, QUEUES, SessionEndReason } from "@devops/messaging";
import crypto from "crypto";

const POLL_INTERVAL_MS = 60_000; // poll every minute

// Stable ID for this process — used as the Redis lock value so we can
// identify which replica holds the lock in logs.
const INSTANCE_ID = crypto.randomUUID();

// Leader lock key and TTL. TTL is 1.5× the poll interval so the lock
// always expires if the leader crashes before the next cycle.
const LEADER_LOCK_KEY = "core:reaper:leader";
const LEADER_LOCK_TTL_SECONDS = 90;

/**
 * Session Reaper: periodically scans for LabSession rows that are ACTIVE
 * but their startedAt + ttlMins has expired.
 * Automatically terminates them and emits SessionEndedEvent.
 *
 * Multi-replica safety: uses a Redis SET NX leader lock so only one
 * replica runs the reap loop per cycle. Without this, every replica would
 * find the same expired sessions and emit N duplicate SessionEndedEvents.
 */
export function startSessionReaper(fastify: FastifyInstance): NodeJS.Timeout {
  fastify.log.info({ instanceId: INSTANCE_ID }, "Session reaper started");

  const reap = async () => {
    // Acquire leader lock — only one replica runs the reaper per cycle.
    // SET NX returns "OK" if the key was set, null if it already existed.
    const acquired = await fastify.redis.set(
      LEADER_LOCK_KEY,
      INSTANCE_ID,
      "EX",
      LEADER_LOCK_TTL_SECONDS,
      "NX"
    );

    if (!acquired) {
      // Another replica is the current leader — skip this cycle silently.
      return;
    }

    fastify.log.debug({ instanceId: INSTANCE_ID }, "Session reaper: acquired leader lock");

    // 1. Standard user sessions (fastify.sessionTTLMins)
    const standardExpirationThreshold = new Date(Date.now() - fastify.sessionTTLMins * 60_000);
    // 2. Guest trial sessions (fastify.guestTrialTTLMins)
    const guestExpirationThreshold = new Date(Date.now() - (fastify.guestTrialTTLMins || 10) * 60_000);

    const expiredSessions = await fastify.prisma.labSession.findMany({
      where: {
        status: "ACTIVE",
        OR: [
          {
            userId: { startsWith: "guest_" },
            startedAt: { lt: guestExpirationThreshold },
          },
          {
            NOT: { userId: { startsWith: "guest_" } },
            startedAt: { lt: standardExpirationThreshold },
          },
        ],
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

