import type { FastifyInstance } from "fastify";
import { SessionStartedEvent, SessionEndedEvent, SessionEndReason, QUEUES } from "@devops/messaging";

const POLL_INTERVAL_MS = 500; // poll every 500ms
const BATCH_SIZE = 10;

/**
 * Outbox Poller: periodically scans unprocessed OutboxEvents and publishes them
 * to Kafka + RabbitMQ. This guarantees at-least-once delivery even if the
 * broker was down at the time the HTTP request committed the DB transaction.
 */
export function startOutboxPoller(fastify: FastifyInstance): NodeJS.Timeout {
  fastify.log.info("Outbox poller started");

  const poll = async () => {
    const events: {
      id: string;
      eventType: string;
      payload: unknown;
      createdAt: Date;
      processed: boolean;
      retryCount: number;
      failed: boolean;
    }[] = await fastify.prisma.$queryRaw`
      SELECT * FROM "CoreOutboxEvent"
      WHERE "processed" = false AND "failed" = false
      ORDER BY "createdAt" ASC
      LIMIT ${BATCH_SIZE}
      FOR UPDATE SKIP LOCKED
    `;

    if (events.length === 0) return;

    fastify.log.info({ count: events.length }, "Outbox poller: processing undelivered events");

    for (const event of events) {
      try {
        if (event.eventType === "SessionStartedEvent" || event.eventType === "session.started") {
          const payload = event.payload as {
            type: "session.started";
            sessionId: string;
            userId: string;
            challengeId: string;
            image: string;
            ttlMins: number;
            requiredProvider?: string;
          };
          await fastify.kafka.emit(new SessionStartedEvent(payload));
          const provider = (payload["requiredProvider"] as string) || "docker";
          await fastify.rabbitmq.publish(`${QUEUES.PROVISION_SANDBOX}.${provider}`, payload);
        } else if (event.eventType === "SessionEndedEvent" || event.eventType === "session.ended") {
          const payload = event.payload as {
            type: "session.ended";
            sessionId: string;
            reason: SessionEndReason;
          };
          await fastify.kafka.emit(new SessionEndedEvent(payload));
          await fastify.rabbitmq.publish(QUEUES.TERMINATE_SANDBOX, payload);
        }

        await fastify.prisma.coreOutboxEvent.update({
          where: { id: event.id },
          data: { processed: true },
        });

        fastify.log.debug(
          { eventId: event.id, eventType: event.eventType },
          "Outbox event delivered"
        );
      } catch (err) {
        const nextRetry = (event.retryCount || 0) + 1;
        const isFailed = nextRetry >= 5;

        fastify.log.error(
          { err, eventId: event.id, retryCount: nextRetry, failed: isFailed },
          isFailed
            ? "Core outbox poller: event exceeded max retries (5) — marking as failed poison-pill"
            : "Core outbox poller: failed to deliver event — incrementing retry count"
        );

        await fastify.prisma.coreOutboxEvent.update({
          where: { id: event.id },
          data: {
            retryCount: nextRetry,
            failed: isFailed,
          },
        });
      }
    }
  };

  // Run immediately on startup to flush any events that survived a previous crash
  poll().catch((err) => fastify.log.error(err, "Outbox initial flush failed"));

  return setInterval(() => {
    poll().catch((err) => fastify.log.error(err, "Outbox poll cycle failed"));
  }, POLL_INTERVAL_MS);
}
