import type { FastifyInstance } from "fastify";

export interface AwardBadgeOptions {
  userId: string;
  badgeSlug: string;
}

export interface BadgeAwardResult {
  awarded: boolean;
  badgeId?: string;
  badgeSlug?: string;
  badgeTitle?: string;
}

/**
 * Checks and awards a badge to a user if not already earned.
 */
export async function awardBadgeIfEligible(
  fastify: FastifyInstance,
  options: AwardBadgeOptions
): Promise<BadgeAwardResult> {
  const { userId, badgeSlug } = options;

  try {
    const badge = await fastify.prisma.badge.findUnique({
      where: { slug: badgeSlug },
    });

    if (!badge) {
      fastify.log.warn({ badgeSlug }, "Badge slug not found in database");
      return { awarded: false };
    }

    const existing = await fastify.prisma.userBadge.findUnique({
      where: {
        userId_badgeId: {
          userId,
          badgeId: badge.id,
        },
      },
    });

    if (existing) {
      return { awarded: false };
    }

    await fastify.prisma.userBadge.create({
      data: {
        userId,
        badgeId: badge.id,
        earnedAt: new Date(),
      },
    });

    fastify.log.info({ userId, badgeSlug, badgeTitle: badge.title }, "User earned new badge");
    return {
      awarded: true,
      badgeId: badge.id,
      badgeSlug: badge.slug,
      badgeTitle: badge.title,
    };
  } catch (err) {
    fastify.log.error(err, "Failed to award badge");
    return { awarded: false };
  }
}

/**
 * Evaluates completion and streak milestones to award relevant badges:
 * 1. 'first-blood': First completed challenge.
 * 2. 'streak-3': 3-day activity streak.
 * 3. 'streak-7': 7-day activity streak.
 * 4. 'streak-30': 30-day activity streak.
 * 5. 'path-master': Completing all challenges associated with a learning path.
 */
export async function evaluateMilestoneBadges(
  fastify: FastifyInstance,
  userId: string,
  currentStreak: number,
  challengeId?: string
): Promise<string[]> {
  const awardedBadges: string[] = [];

  // 1. Check total challenge completions
  const totalCompleted = await fastify.prisma.labSession.count({
    where: { userId, status: "COMPLETED" },
  });

  if (totalCompleted >= 1) {
    const res = await awardBadgeIfEligible(fastify, { userId, badgeSlug: "first-blood" });
    if (res.awarded) awardedBadges.push("first-blood");
  }

  // 2. Streak milestones
  if (currentStreak >= 3) {
    const res = await awardBadgeIfEligible(fastify, { userId, badgeSlug: "streak-3" });
    if (res.awarded) awardedBadges.push("streak-3");
  }

  if (currentStreak >= 7) {
    const res = await awardBadgeIfEligible(fastify, { userId, badgeSlug: "streak-7" });
    if (res.awarded) awardedBadges.push("streak-7");
  }

  if (currentStreak >= 30) {
    const res = await awardBadgeIfEligible(fastify, { userId, badgeSlug: "streak-30" });
    if (res.awarded) awardedBadges.push("streak-30");
  }

  // 3. Learning Path Roadmap Badge
  if (challengeId) {
    const challenge = await fastify.prisma.challenge.findUnique({
      where: { id: challengeId },
      include: { module: { include: { path: { include: { modules: { include: { challenges: true } } } } } } },
    });

    const path = challenge?.module?.path;
    if (path) {
      const allPathChallengeIds = path.modules.flatMap((m) => m.challenges.map((c) => c.id));
      if (allPathChallengeIds.length > 0) {
        const userCompletedForPath = await fastify.prisma.labSession.findMany({
          where: {
            userId,
            challengeId: { in: allPathChallengeIds },
            status: "COMPLETED",
          },
          select: { challengeId: true },
        });

        const completedSet = new Set(userCompletedForPath.map((s) => s.challengeId));
        const allCompleted = allPathChallengeIds.every((cid) => completedSet.has(cid));

        if (allCompleted) {
          const pathBadge = await fastify.prisma.badge.findFirst({
            where: { roadmapId: path.id },
          });

          if (pathBadge) {
            const res = await awardBadgeIfEligible(fastify, { userId, badgeSlug: pathBadge.slug });
            if (res.awarded) awardedBadges.push(pathBadge.slug);
          }
        }
      }
    }
  }

  return awardedBadges;
}
