import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { UserRegisteredEvent, EmailVerificationRequestedEvent, BaseEvent } from '@devops/messaging';
import { PrismaClient } from '@devops/db';

const prisma = new PrismaClient();

export const outboxPlugin = fp(async (fastify: FastifyInstance) => {
  let intervalId: NodeJS.Timeout | null = null;
  let processing = false;

  const processOutbox = async () => {
    if (processing) return;

    // Safety check: Don't process if messaging isn't initialized yet
    if (!fastify.messaging || !fastify.messaging.producer) {
      return;
    }

    processing = true;

    try {
      const events = await prisma.outboxEvent.findMany({
        where: { processed: false },
        take: 10,
        orderBy: { createdAt: 'asc' },
      });

      for (const event of events) {
        let eventInstance: BaseEvent<any> | null = null;
        
        if (event.eventType === 'UserRegisteredEvent') {
          eventInstance = new UserRegisteredEvent(event.payload as any);
        } else if (event.eventType === 'EmailVerificationRequestedEvent') {
          eventInstance = new EmailVerificationRequestedEvent(event.payload as any);
        }

        if (eventInstance) {
          try {
            await fastify.messaging.emit(eventInstance);
            await prisma.outboxEvent.update({
              where: { id: event.id },
              data: { processed: true },
            });
          } catch (err) {
            fastify.log.error({ err, eventId: event.id }, 'Failed to emit outbox event to Kafka');
            // Break the loop if Kafka is down so we don't spam errors for the whole batch
            break; 
          }
        } else {
          fastify.log.warn({ eventId: event.id, eventType: event.eventType }, 'Unknown event type in outbox');
          await prisma.outboxEvent.update({
            where: { id: event.id },
            data: { processed: true },
          });
        }
      }
    } catch (err) {
      fastify.log.error(err, 'Error in outbox processing cycle');
    } finally {
      processing = false;
    }
  };

  fastify.addHook('onReady', async () => {
    const intervalMs = Number(process.env['OUTBOX_INTERVAL_MS']) || 2000;
    intervalId = setInterval(processOutbox, intervalMs);
    fastify.log.info({ intervalMs }, '🔄 Outbox processor started');
  });

  fastify.addHook('onClose', async () => {
    if (intervalId) {
      clearInterval(intervalId);
      fastify.log.info('Outbox processor stopped');
    }
  });
});
