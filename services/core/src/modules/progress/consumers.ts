import type { FastifyInstance } from "fastify";
import { MessagingService, TOPICS, GROUPS } from "@devops/messaging";
import { calculateStreak } from "../../utils/streak";
import { evaluateMilestoneBadges } from "../../utils/badges";

export async function registerProgressConsumers(fastify: FastifyInstance) {
  const messaging = fastify.kafka as MessagingService;

  await messaging.consume(`${GROUPS.PROGRESS}.solved` as any, TOPICS.CHALLENGE_SOLVED, async (event) => {
    const { submissionId, challengeId, userId, stdout, stderr, exitCode, durationMs, checks } =
      event.payload;

    fastify.log.info({ challengeId, userId }, "Processing challenge solved event");

    // For guest sessions (userId starting with "guest_"), skip XP awarding, streak calculation, badges, and user completions
    if (userId.startsWith("guest_")) {
      try {
        await fastify.prisma.labSession.updateMany({
          where: { id: submissionId, status: "ACTIVE" },
          data: { status: "COMPLETED", endedAt: new Date() },
        });
        fastify.metrics.challengeSolvedCounter.inc({ challengeId });
        fastify.log.info({ challengeId, userId }, "Guest trial solve recorded (XP/progress persistence skipped)");
      } catch (err) {
        fastify.log.error(err, "Failed to update guest lab session on solved event");
      }
      return;
    }

    try {
      const challenge = await fastify.prisma.challenge.findUnique({
        where: { id: challengeId },
      });

      await fastify.prisma.node.upsert({
        where: { id: challengeId },
        update: {
          title: challenge?.title || "Challenge Lab",
          description: challenge?.description || "Interactive lab scenario",
          metadata: {
            xp: challenge?.xp || 100,
            category: challenge?.category || "DOCKER",
            difficulty: challenge?.difficulty || "JUNIOR",
            tags: challenge?.tags || [],
          },
        },
        create: {
          id: challengeId,
          type: "SCENARIO",
          title: challenge?.title || "Challenge Lab",
          description: challenge?.description || "Interactive lab scenario",
          metadata: {
            xp: challenge?.xp || 100,
            category: challenge?.category || "DOCKER",
            difficulty: challenge?.difficulty || "JUNIOR",
            tags: challenge?.tags || [],
          },
        },
      });

      const existingCompletion = await fastify.prisma.completion.findUnique({
        where: { userId_nodeId: { userId, nodeId: challengeId } },
      });
      const isFirstSolve = !existingCompletion;

      await fastify.prisma.completion.upsert({
        where: { userId_nodeId: { userId, nodeId: challengeId } },
        update: {},
        create: { userId, nodeId: challengeId },
      });

      if (checks && Array.isArray(checks)) {
        for (const check of checks) {
          await fastify.prisma.challengeCheckResult.upsert({
            where: {
              userId_challengeId_checkId: {
                userId,
                challengeId,
                checkId: check.checkId,
              },
            },
            update: {
              status: check.passed ? "PASSED" : "FAILED",
              message: check.message,
              lastRunAt: new Date(),
            },
            create: {
              userId,
              challengeId,
              checkId: check.checkId,
              status: check.passed ? "PASSED" : "FAILED",
              message: check.message,
              lastRunAt: new Date(),
            },
          });
        }
      }

      const xpEarned = challenge?.xp ?? 100;
      const currentUser = await fastify.prisma.user.findUnique({
        where: { id: userId },
        select: { currentStreak: true, longestStreak: true, lastActivityDate: true },
      });

      const streakUpdate = currentUser
        ? calculateStreak({
            currentStreak: currentUser.currentStreak,
            longestStreak: currentUser.longestStreak,
            lastActivityDate: currentUser.lastActivityDate,
          })
        : null;

      if (isFirstSolve) {
        await fastify.prisma.user.update({
          where: { id: userId },
          data: {
            xp: { increment: xpEarned },
            ...(streakUpdate
              ? {
                  currentStreak: streakUpdate.currentStreak,
                  longestStreak: streakUpdate.longestStreak,
                  lastActivityDate: streakUpdate.lastActivityDate,
                }
              : {}),
          },
        });
      }

      await fastify.prisma.labSession.updateMany({
        where: { id: submissionId, status: "ACTIVE" },
        data: { status: "COMPLETED", endedAt: new Date() },
      });

      await fastify.prisma.submission.create({
        data: {
          status: "COMPLETED",
          code: "",
          userId,
          challengeId,
          result: { stdout, stderr, exitCode, durationMs },
        },
      });

      fastify.metrics.challengeSolvedCounter.inc({ challengeId });
      fastify.log.info(
        { challengeId, userId, xpEarned, isFirstSolve },
        "Challenge solved processed successfully"
      );

      // Evaluate and award milestone badges on first solve
      if (isFirstSolve) {
        const newStreak = streakUpdate ? streakUpdate.currentStreak : 0;
        await evaluateMilestoneBadges(fastify, userId, newStreak, challengeId);
      }
    } catch (err) {
      fastify.log.error(err, "Failed to process challenge solved event");
    }
  });

  await messaging.consume(`${GROUPS.PROGRESS}.failed` as any, TOPICS.CHALLENGE_FAILED, async (event) => {
    const { challengeId, userId, stdout, stderr, exitCode, durationMs, checks } = event.payload;

    fastify.log.info({ challengeId, userId }, "Processing challenge failed event");

    if (userId.startsWith("guest_")) {
      fastify.metrics.challengeFailedCounter.inc({ challengeId });
      fastify.log.info({ challengeId, userId }, "Guest trial failure recorded (user submission skipped)");
      return;
    }

    try {
      await fastify.prisma.submission.create({
        data: {
          status: "FAILED",
          code: "",
          userId,
          challengeId,
          result: { stdout, stderr, exitCode, durationMs },
        },
      });

      if (checks && Array.isArray(checks)) {
        for (const check of checks) {
          await fastify.prisma.challengeCheckResult.upsert({
            where: {
              userId_challengeId_checkId: {
                userId,
                challengeId,
                checkId: check.checkId,
              },
            },
            update: {
              status: check.passed ? "PASSED" : "FAILED",
              message: check.message,
              lastRunAt: new Date(),
            },
            create: {
              userId,
              challengeId,
              checkId: check.checkId,
              status: check.passed ? "PASSED" : "FAILED",
              message: check.message,
              lastRunAt: new Date(),
            },
          });
        }
      }

      fastify.metrics.challengeFailedCounter.inc({ challengeId });
      fastify.log.info({ challengeId, userId }, "Challenge failed registered successfully");
    } catch (err) {
      fastify.log.error(err, "Failed to process challenge failed event");
    }
  });

  await messaging.consume(`${GROUPS.PROGRESS}.session_failed` as any, TOPICS.SESSION_FAILED, async (event) => {
    const { sessionId, userId, challengeId, error } = event.payload as {
      sessionId: string;
      userId: string;
      challengeId: string;
      error: string;
    };

    fastify.log.warn({ sessionId, userId, challengeId, error }, "Processing session failed event");

    try {
      await fastify.prisma.labSession.updateMany({
        where: { id: sessionId, status: "ACTIVE" },
        data: { status: "TERMINATED", endedAt: new Date() },
      });
      fastify.log.info({ sessionId }, "LabSession marked TERMINATED following provisioning failure");
    } catch (err) {
      fastify.log.error(err, "Failed to update session status on session failed event");
    }
  });

  fastify.log.info("Progress consumers active");
}
