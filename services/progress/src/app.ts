import Fastify from 'fastify';
import cors from '@fastify/cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@devops/db';
import { MessagingService, TOPICS, GROUPS } from '@devops/messaging';

dotenv.config();

export const prisma = new PrismaClient();

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
    return { status: 'ok', service: 'progress-service' };
  });

  fastify.addHook('onReady', async () => {
    // 1. Consume Challenge Solved events
    await messaging.consume(GROUPS.PROGRESS, TOPICS.CHALLENGE_SOLVED, async (event) => {
      const { submissionId, challengeId, userId, stdout, stderr, exitCode, durationMs } = event.payload;
      
      fastify.log.info({ challengeId, userId }, '🏆 Processing challenge solved event');

      try {
        // Fetch challenge details
        const challenge = await prisma.challenge.findUnique({
          where: { id: challengeId },
        });

        // Ensure the matching Node exists in the Node table (prerequisite graph)
        await prisma.node.upsert({
          where: { id: challengeId },
          update: {},
          create: {
            id: challengeId,
            type: 'SCENARIO',
            title: challenge?.title || 'Challenge Lab',
            description: challenge?.description || 'Interactive lab scenario',
          },
        });

        // Mark completion
        await prisma.completion.upsert({
          where: {
            userId_nodeId: {
              userId,
              nodeId: challengeId,
            },
          },
          update: {},
          create: {
            userId,
            nodeId: challengeId,
          },
        });

        // Award XP to user
        const xpEarned = challenge?.xp ?? 100;
        await prisma.user.update({
          where: { id: userId },
          data: {
            xp: {
              increment: xpEarned,
            },
          },
        });

        // Terminate / Complete active lab session
        await prisma.labSession.updateMany({
          where: { id: submissionId, status: 'ACTIVE' },
          data: {
            status: 'COMPLETED',
            endedAt: new Date(),
          },
        });

        // Save a permanent Submission audit log
        await prisma.submission.create({
          data: {
            status: 'COMPLETED',
            code: '', // labs do not store code files
            userId,
            challengeId,
            result: {
              stdout,
              stderr,
              exitCode,
              durationMs,
            },
          },
        });

        fastify.log.info({ challengeId, userId, xpEarned }, '✅ Challenge solved completed successfully');
      } catch (err) {
        fastify.log.error(err, 'Failed to process challenge solved event');
      }
    });

    // 2. Consume Challenge Failed events
    await messaging.consume(GROUPS.PROGRESS, TOPICS.CHALLENGE_FAILED, async (event) => {
      const { challengeId, userId, stdout, stderr, exitCode, durationMs } = event.payload;

      fastify.log.info({ challengeId, userId }, '❌ Processing challenge failed event');

      try {
        // Save failed submission log
        await prisma.submission.create({
          data: {
            status: 'FAILED',
            code: '',
            userId,
            challengeId,
            result: {
              stdout,
              stderr,
              exitCode,
              durationMs,
            },
          },
        });

        fastify.log.info({ challengeId, userId }, '✅ Challenge failed registered successfully');
      } catch (err) {
        fastify.log.error(err, 'Failed to process challenge failed event');
      }
    });

    fastify.log.info('📈 Progress Service Consumers Active');
  });

  fastify.addHook('onClose', async () => {
    await prisma.$disconnect();
    await messaging.disconnect();
  });

  return fastify;
}
