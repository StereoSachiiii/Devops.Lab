import type { FastifyInstance } from "fastify";
import { MessagingService, TOPICS, GROUPS, QUEUES } from "@devops/messaging";
import { sendWelcomeEmail, sendVerificationEmail } from "./mailer";

export async function registerNotificationConsumers(fastify: FastifyInstance) {
  const messaging = fastify.kafka as MessagingService;
  const rabbitmq = fastify.rabbitmq;

  // 1. KAFKA: Consume domain events, format payload, and push a job to RabbitMQ
  await messaging.consume(GROUPS.NOTIFICATIONS, TOPICS.USER_REGISTERED, async (event) => {
    fastify.log.info(
      { userId: event.payload.userId },
      "Processing USER_REGISTERED event (pushing to RabbitMQ)"
    );

    const email = (event.payload as any).email || `user-${event.payload.userId}@example.com`;
    const idempotencyKey = `email:welcome:${event.payload.userId}`;

    // 24-hour idempotency lock
    const locked = await fastify.redis.set(idempotencyKey, "1", "EX", 86400, "NX");
    if (!locked) {
      fastify.log.debug({ userId: event.payload.userId }, "Duplicate welcome email dropped");
      return;
    }

    await rabbitmq.publish(QUEUES.SEND_EMAIL, {
      type: "welcome",
      userId: event.payload.userId,
      email,
    });
  });

  await messaging.consume(
    GROUPS.NOTIFICATIONS,
    TOPICS.EMAIL_VERIFICATION_REQUESTED,
    async (event) => {
      fastify.log.info(
        { userId: event.payload.userId },
        "Processing EMAIL_VERIFICATION_REQUESTED event (pushing to RabbitMQ)"
      );

      const email = (event.payload as any).email || `user-${event.payload.userId}@example.com`;
      const idempotencyKey = `email:verification:${event.payload.userId}:${event.payload.token}`;

      // 24-hour idempotency lock
      const locked = await fastify.redis.set(idempotencyKey, "1", "EX", 86400, "NX");
      if (!locked) {
        fastify.log.debug({ userId: event.payload.userId }, "Duplicate verification email dropped");
        return;
      }

      await rabbitmq.publish(QUEUES.SEND_EMAIL, {
        type: "verification",
        userId: event.payload.userId,
        email,
        token: event.payload.token,
      });
    }
  );

  // 2. RABBITMQ: Consume the discrete jobs with proper DLQ/retry backpressure
  await rabbitmq.consume<any>(QUEUES.SEND_EMAIL, async (job) => {
    fastify.log.info({ job }, "Consuming email job from RabbitMQ");

    // RabbitMQ job worker execution (idempotency key already claimed at Kafka ingress)

    try {
      if (job.type === "welcome") {
        await sendWelcomeEmail(job.email, job.name || "User");
        fastify.metrics?.emailSentCounter?.inc({ type: "welcome" });
        fastify.log.info({ userId: job.userId }, "Welcome email sent successfully");
      } else if (job.type === "verification") {
        await sendVerificationEmail(job.email, job.token);
        fastify.metrics?.emailSentCounter?.inc({ type: "verification" });
        fastify.log.info({ userId: job.userId }, "Verification email sent successfully");
      }
    } catch (err) {
      fastify.metrics?.emailFailedCounter?.inc({ type: job.type || "unknown" });
      fastify.log.error({ err, job }, "Failed to send email");
      throw err;
    }
  });

  fastify.log.info("Notification consumers active (Kafka & RabbitMQ)");
}
