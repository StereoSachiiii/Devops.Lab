import Fastify from 'fastify';
import cors from '@fastify/cors';
import dotenv from 'dotenv';
import { MessagingService, TOPICS, GROUPS } from '@devops/messaging';

dotenv.config();

export function buildApp() {
  const fastify = Fastify({
    logger: process.env['NODE_ENV'] === 'test' ? false : true,
  });

  fastify.register(cors);

  const messaging = new MessagingService();
  fastify.decorate('messaging', messaging);

  /**
   * Health Check
   */
  fastify.get('/health', async () => {
    return { status: 'ok', service: 'notification-service' };
  });

  fastify.addHook('onReady', async () => {
    // 1. Listen for User Registered
    await messaging.consume(GROUPS.NOTIFICATIONS, TOPICS.USER_REGISTERED, async (event) => {
      fastify.log.info({ userId: event.payload.userId }, '📧 Welcome email "sent"');
      // In a real app, you'd use Nodemailer or an external API here
    });

    // 2. Listen for Email Verification
    await messaging.consume(GROUPS.NOTIFICATIONS, TOPICS.EMAIL_VERIFICATION_REQUESTED, async (event) => {
      fastify.log.info({ 
        userId: event.payload.userId, 
        token: event.payload.token 
      }, '🔗 Verification link "sent"');
    });

    fastify.log.info('🔔 Notification Service Consumers Active');
  });

  fastify.addHook('onClose', async () => {
    await messaging.disconnect();
  });

  return fastify;
}
