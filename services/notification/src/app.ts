import Fastify from 'fastify';
import { MessagingService, RabbitMQService } from '@devops/messaging';
import pino from 'pino';
import { registerNotificationConsumers } from './consumers';
import { metricsPlugin } from './plugins/metrics';

export async function buildApp() {
  const app = Fastify({
    logger: pino({ level: process.env.LOG_LEVEL || 'info' }),
  });

  await app.register(metricsPlugin);

  const kafka = new MessagingService('notification-service');
  app.decorate('kafka', kafka);

  const rabbitmq = new RabbitMQService();
  app.decorate('rabbitmq', rabbitmq);

  app.addHook('onReady', async () => {
    app.log.info('Starting Kafka & RabbitMQ consumers...');
    try {
      await rabbitmq.init();
      // Start consumers asynchronously so slow Kafka rebalancing doesn't block the Fastify boot process
      registerNotificationConsumers(app as any)
        .then(() => app.log.info('Notification service ready'))
        .catch((err: any) => app.log.error({ err: err.message }, 'Failed to initialize consumers'));
    } catch (err: any) {
      app.log.error({ err: err.message }, 'Failed to initialize RabbitMQ');
    }
  });

  app.addHook('onClose', async () => {
    await kafka.disconnect();
    await rabbitmq.disconnect();
  });

  app.get('/health', async () => {
    return { status: 'ok', service: 'notification-service' };
  });

  return app;
}

// Type declaration for the decorated instance
declare module 'fastify' {
  interface FastifyInstance {
    kafka: MessagingService;
    rabbitmq: RabbitMQService;
  }
}
