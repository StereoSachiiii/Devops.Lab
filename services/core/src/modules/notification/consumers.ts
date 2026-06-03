import type { FastifyInstance } from 'fastify';
import { MessagingService, TOPICS, GROUPS } from '@devops/messaging';

export async function registerNotificationConsumers(fastify: FastifyInstance) {
  const messaging = fastify.kafka as MessagingService;

  /**
   * Consume identity.user.registered events.
   * In production, this would trigger an email via Nodemailer or an external API.
   */
  await messaging.consume(GROUPS.NOTIFICATIONS, TOPICS.USER_REGISTERED, async (event) => {
    fastify.log.info({ userId: event.payload.userId }, 'Welcome email "sent"');
  });

  /**
   * Consume identity.email.verify events.
   * In production, this would send a verification email with the token link.
   */
  await messaging.consume(GROUPS.NOTIFICATIONS, TOPICS.EMAIL_VERIFICATION_REQUESTED, async (event) => {
    fastify.log.info({
      userId: event.payload.userId,
      token: event.payload.token
    }, 'Verification link "sent"');
  });

  fastify.log.info('Notification consumers active');
}
