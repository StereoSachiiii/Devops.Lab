import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { MessagingService } from '@devops/messaging';

declare module 'fastify' {
  interface FastifyInstance {
    kafka: MessagingService;
  }
}

/**
 * Kafka messaging plugin.
 *
 * Creates a MessagingService, decorates it on the Fastify instance, and
 * initializes the producer in the background (non-blocking) so the service
 * can start accepting requests even if Kafka is temporarily unreachable.
 */
export const kafkaPlugin = fp(async (fastify: FastifyInstance) => {
  const kafka = new MessagingService();
  fastify.decorate('kafka', kafka);

  fastify.addHook('onReady', async () => {
    kafka.initProducer()
      .then(()  => fastify.log.info('Kafka producer ready'))
      .catch(e  => fastify.log.error({ err: e.message }, 'Kafka init failed — retrying in background'));
  });

  fastify.addHook('onClose', async () => {
    await kafka.disconnect();
  });
});
