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

  // Circuit breaker state for Kafka broker
  let circuitOpenUntil = 0;
  let consecutiveFailures = 0;
  let backoffMs = 5000;
  const MAX_BACKOFF_MS = 60000;

  const processOutbox = async () => {
    if (processing) return;

    const now = Date.now();
    if (now < circuitOpenUntil) {
      return; // Skip cycle while circuit is OPEN
    }

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
        retryCount: number;
        failed: boolean;
      }[] = await prisma.$queryRaw`
        SELECT * FROM "AuthOutboxEvent"
        WHERE processed = false AND failed = false
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
          await Promise.race([
            fastify.kafka.emit(eventInstance),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("Kafka emit timed out after 5s")), 5000)
            ),
          ]);
          await prisma.authOutboxEvent.update({
            where: { id: event.id },
            data: { processed: true },
          });

          // Reset circuit breaker on successful delivery
          consecutiveFailures = 0;
          backoffMs = 5000;
        } catch (err) {
          consecutiveFailures++;
          const nextRetry = (event.retryCount || 0) + 1;
          const isFailed = nextRetry >= 5;

          fastify.log.error(
            { err, eventId: event.id, retryCount: nextRetry, failed: isFailed, consecutiveFailures },
            isFailed
              ? "Outbox event exceeded max retries (5) — marking as failed poison-pill"
              : "Failed to emit outbox event to Kafka — incrementing retry count"
          );

          await prisma.authOutboxEvent.update({
            where: { id: event.id },
            data: {
              retryCount: nextRetry,
              failed: isFailed,
            },
          });

          if (consecutiveFailures >= 3) {
            circuitOpenUntil = Date.now() + backoffMs;
            fastify.log.warn(
              { consecutiveFailures, backoffMs },
              "Kafka outbox circuit tripped to OPEN. Backing off before next poll cycle."
            );
            backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
          }
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
