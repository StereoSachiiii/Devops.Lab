import type { FastifyInstance } from 'fastify';
import { MessagingService, TOPICS, GROUPS, QUEUES } from '@devops/messaging';
import { sendWelcomeEmail, sendVerificationEmail } from './mailer';

export async function registerNotificationConsumers(fastify: FastifyInstance) {
  const messaging = fastify.kafka as MessagingService;
  const rabbitmq = fastify.rabbitmq;

  // 1. KAFKA: Consume domain events, format payload, and push a job to RabbitMQ
  await messaging.consume(GROUPS.NOTIFICATIONS, TOPICS.USER_REGISTERED, async (event) => {
    fastify.log.info({ userId: event.payload.userId }, 'Processing USER_REGISTERED event (pushing to RabbitMQ)');
    const email = (event.payload as any).email || `user-${event.payload.userId}@example.com`;
    
    await rabbitmq.publish(QUEUES.SEND_EMAIL, {
      type: 'welcome',
      userId: event.payload.userId,
      email,
    });
  });

  await messaging.consume(GROUPS.NOTIFICATIONS, TOPICS.EMAIL_VERIFICATION_REQUESTED, async (event) => {
    fastify.log.info({ userId: event.payload.userId }, 'Processing EMAIL_VERIFICATION_REQUESTED event (pushing to RabbitMQ)');
    const email = (event.payload as any).email || `user-${event.payload.userId}@example.com`;
    
    await rabbitmq.publish(QUEUES.SEND_EMAIL, {
      type: 'verification',
      userId: event.payload.userId,
      email,
      token: event.payload.token,
    });
  });

  // 2. RABBITMQ: Consume the discrete jobs with proper DLQ/retry backpressure
  await rabbitmq.consume<any>(QUEUES.SEND_EMAIL, async (job) => {
    fastify.log.info({ job }, 'Consuming email job from RabbitMQ');
    
    if (job.type === 'welcome') {
      await sendWelcomeEmail(job.email);
      fastify.log.info({ userId: job.userId }, 'Welcome email sent via nodemailer');
    } else if (job.type === 'verification') {
      await sendVerificationEmail(job.email, job.token);
      fastify.log.info({ userId: job.userId }, 'Verification email sent via nodemailer');
    }
  });

  fastify.log.info('Notification consumers active (Kafka & RabbitMQ)');
}
