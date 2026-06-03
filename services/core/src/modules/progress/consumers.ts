import type { FastifyInstance } from 'fastify';
import { MessagingService, TOPICS, GROUPS } from '@devops/messaging';

export async function registerProgressConsumers(fastify: FastifyInstance) {
  const messaging = fastify.kafka as MessagingService;

  /**
   * Consume curriculum.challenge.solved events.
   * - Ensures matching Node exists in the DAG
   * - Marks completion for the user
   * - Awards XP
   * - Completes the active lab session
   * - Creates a permanent Submission audit log
   */
  await messaging.consume(GROUPS.PROGRESS, TOPICS.CHALLENGE_SOLVED, async (event) => {
    const { submissionId, challengeId, userId, stdout, stderr, exitCode, durationMs } = event.payload;

    fastify.log.info({ challengeId, userId }, 'Processing challenge solved event');

    try {
      const challenge = await fastify.prisma.challenge.findUnique({
        where: { id: challengeId },
      });

      // Ensure the matching Node exists in the prerequisite graph
      await fastify.prisma.node.upsert({
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
      await fastify.prisma.completion.upsert({
        where: { userId_nodeId: { userId, nodeId: challengeId } },
        update: {},
        create: { userId, nodeId: challengeId },
      });

      // Award XP to user
      const xpEarned = challenge?.xp ?? 100;
      await fastify.prisma.user.update({
        where: { id: userId },
        data: { xp: { increment: xpEarned } },
      });

      // Complete active lab session
      await fastify.prisma.labSession.updateMany({
        where: { id: submissionId, status: 'ACTIVE' },
        data: { status: 'COMPLETED', endedAt: new Date() },
      });

      // Save permanent Submission audit log
      await fastify.prisma.submission.create({
        data: {
          status: 'COMPLETED',
          code: '',
          userId,
          challengeId,
          result: { stdout, stderr, exitCode, durationMs },
        },
      });

      fastify.log.info({ challengeId, userId, xpEarned }, 'Challenge solved processed successfully');
    } catch (err) {
      fastify.log.error(err, 'Failed to process challenge solved event');
    }
  });

  /**
   * Consume curriculum.challenge.failed events.
   * Creates a failed Submission audit log entry.
   */
  await messaging.consume(GROUPS.PROGRESS, TOPICS.CHALLENGE_FAILED, async (event) => {
    const { challengeId, userId, stdout, stderr, exitCode, durationMs } = event.payload;

    fastify.log.info({ challengeId, userId }, 'Processing challenge failed event');

    try {
      await fastify.prisma.submission.create({
        data: {
          status: 'FAILED',
          code: '',
          userId,
          challengeId,
          result: { stdout, stderr, exitCode, durationMs },
        },
      });

      fastify.log.info({ challengeId, userId }, 'Challenge failed registered successfully');
    } catch (err) {
      fastify.log.error(err, 'Failed to process challenge failed event');
    }
  });

  fastify.log.info('Progress consumers active');
}
