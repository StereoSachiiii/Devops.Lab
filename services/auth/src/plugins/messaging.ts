import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { MessagingService } from '@devops/messaging';

declare module 'fastify' {
  interface FastifyInstance {
    messaging: MessagingService;
  }
}

/**
 * Kafka messaging plugin.
 *
 * Creates a MessagingService, decorates it on the Fastify instance, and
 * initializes the producer in the background (non-blocking) so the service
 * can start accepting requests even if Kafka is temporarily unreachable.
 */
export const messagingPlugin = fp(async (fastify: FastifyInstance) => {
  const messaging = new MessagingService();
  fastify.decorate('messaging', messaging);

  fastify.addHook('onReady', async () => {
    messaging.initProducer()
      .then(()  => fastify.log.info('Kafka producer ready'))
      .catch(e  => fastify.log.error({ err: e.message }, 'Kafka init failed — retrying in background'));
  });

  fastify.addHook('onClose', async () => {
    await messaging.disconnect();
  });
});
