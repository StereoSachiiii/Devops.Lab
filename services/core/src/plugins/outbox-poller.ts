import type { FastifyInstance } from 'fastify';
import { SessionStartedEvent, SessionEndedEvent, QUEUES } from '@devops/messaging';

const POLL_INTERVAL_MS = 5_000; // poll every 5 seconds
const BATCH_SIZE = 10;

/**
 * Outbox Poller: periodically scans unprocessed OutboxEvents and publishes them
 * to Kafka + RabbitMQ. This guarantees at-least-once delivery even if the
 * broker was down at the time the HTTP request committed the DB transaction.
 */
export function startOutboxPoller(fastify: FastifyInstance): NodeJS.Timeout {
  fastify.log.info('Outbox poller started');

  const poll = async () => {
    const events = await fastify.prisma.outboxEvent.findMany({
      where: { processed: false },
      orderBy: { createdAt: 'asc' },
      take: BATCH_SIZE,
    });

    if (events.length === 0) return;

    fastify.log.info({ count: events.length }, 'Outbox poller: processing undelivered events');

    for (const event of events) {
      try {
        const payload = event.payload as any;

        if (event.eventType === 'SessionStartedEvent') {
          await fastify.kafka.emit(new SessionStartedEvent(payload));
          await fastify.rabbitmq.publish(QUEUES.PROVISION_SANDBOX, payload);
        } else if (event.eventType === 'SessionEndedEvent') {
          await fastify.kafka.emit(new SessionEndedEvent(payload));
          await fastify.rabbitmq.publish(QUEUES.TERMINATE_SANDBOX, payload);
        } else {
          fastify.log.warn({ eventType: event.eventType }, 'Outbox poller: unknown event type, skipping');
        }

        await fastify.prisma.outboxEvent.update({
          where: { id: event.id },
          data: { processed: true },
        });

        fastify.log.debug({ eventId: event.id, eventType: event.eventType }, 'Outbox event delivered');
      } catch (err) {
        fastify.log.error({ err, eventId: event.id }, 'Outbox poller: failed to deliver event — will retry');
      }
    }
  };

  // Run immediately on startup to flush any events that survived a previous crash
  poll().catch((err) => fastify.log.error(err, 'Outbox initial flush failed'));

  return setInterval(() => {
    poll().catch((err) => fastify.log.error(err, 'Outbox poll cycle failed'));
  }, POLL_INTERVAL_MS);
}
