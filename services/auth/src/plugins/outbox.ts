import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import {
  UserRegisteredEvent,
  EmailVerificationRequestedEvent,
  PasswordResetRequestedEvent,
  UserDeletedEvent,
  BaseEvent,
} from "@devops/messaging";
import { requireEnv } from "@devops/observability";
import { prisma } from "../utils/db";

export const outboxPlugin = fp(async (fastify: FastifyInstance) => {
  let intervalId: NodeJS.Timeout | null = null;
  let processing = false;

  const processOutbox = async () => {
    if (processing) return;

    if (!fastify.kafka || !fastify.kafka.isProducerReady) {
      return;
    }

    processing = true;

    try {
      const events: {
        id: string;
        eventType: string;
        payload: unknown;
        createdAt: Date;
        processed: boolean;
      }[] = await prisma.$queryRaw`
        SELECT * FROM "AuthOutboxEvent"
        WHERE processed = false
        ORDER BY "createdAt" ASC
        LIMIT 10
        FOR UPDATE SKIP LOCKED
      `;

      for (const event of events) {
        let eventInstance: BaseEvent<unknown> | null = null;

        switch (event.eventType) {
          case "UserRegisteredEvent":
            eventInstance = new UserRegisteredEvent(
              event.payload as { userId: string; email: string; name: string | null }
            );
            break;
          case "EmailVerificationRequestedEvent":
            eventInstance = new EmailVerificationRequestedEvent(
              event.payload as { userId: string; email: string; token: string }
            );
            break;
          case "PasswordResetRequestedEvent":
            eventInstance = new PasswordResetRequestedEvent(
              event.payload as { userId: string; email: string; token: string }
            );
            break;
          case "UserDeletedEvent":
            eventInstance = new UserDeletedEvent(event.payload as { userId: string });
            break;
          default:
            fastify.log.warn(
              { eventId: event.id, eventType: event.eventType },
              "Unknown event type in outbox — skipping"
            );
            continue;
        }

        try {
          await fastify.kafka.emit(eventInstance);
          await prisma.authOutboxEvent.update({
            where: { id: event.id },
            data: { processed: true },
          });
        } catch (err) {
          fastify.log.error({ err, eventId: event.id }, "Failed to emit outbox event to Kafka");
          break;
        }
      }
    } catch (err) {
      fastify.log.error(err, "Error in outbox processing cycle");
    } finally {
      processing = false;
    }
  };

  fastify.addHook("onReady", async () => {
    const intervalMs = Number(requireEnv("OUTBOX_INTERVAL_MS"));
    intervalId = setInterval(processOutbox, intervalMs);
    fastify.log.info({ intervalMs }, "🔄 Outbox processor started");
  });

  fastify.addHook("onClose", async () => {
    if (intervalId) {
      clearInterval(intervalId);
      fastify.log.info("Outbox processor stopped");
    }
  });
});
