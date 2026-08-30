import { FastifyInstance, FastifyPluginAsync } from "fastify";

export const dashboardRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get(
    "/me/dashboard",
    {
      preValidation: [app.authenticate],
    },
    async (request, reply) => {
      const userId = request.user?.sub || request.user?.id;
      const prisma = app.prisma;

      // 1. Fetch user & core metrics
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          org: true,
          badges: {
            include: { badge: true },
            orderBy: { earnedAt: "desc" },
            take: 10,
          },
          completions: {
            include: {
              node: true,
            },
            orderBy: { createdAt: "desc" },
            take: 10,
          },
          sessions: {
            include: {
              challenge: true,
            },
            orderBy: { startedAt: "desc" },
            take: 20,
          },
        },
      });

      if (!user) {
        return reply.code(404).send({ error: "User not found" });
      }

      // Check for basic activity
      const hasActivity = user.completions.length > 0 || user.sessions.length > 0;

      // Compute in-progress roadmaps/challenges
      // This is a simplified aggregate: we just take recent sessions
      const inProgressMap = new Map();

      // Standalone challenges from sessions
      for (const session of user.sessions) {
        if (!inProgressMap.has(session.challenge.id)) {
          inProgressMap.set(session.challenge.id, {
            id: session.challenge.id,
            type: "challenge",
            title: session.challenge.title,
            category: session.challenge.category.toString(),
            completed: session.status === "COMPLETED" ? 1 : 0,
            total: 1,
            lastTouchedAt: session.startedAt,
          });
        }
      }

      const inProgress = Array.from(inProgressMap.values())
        .filter((item) => item.completed < item.total) // Only strictly in-progress
        .slice(0, 5);

      // Determine recommended next
      let recommendedNext = null;
      if (inProgress.length > 0) {
        recommendedNext = {
          title: "Continue where you left off",
          description: `Resume practicing ${inProgress[0].title}.`,
          link:
            inProgress[0].type === "roadmap"
              ? `/roadmaps/${inProgress[0].id}`
              : `/challenges/${inProgress[0].id}`,
        };
      } else if (hasActivity) {
        recommendedNext = {
          title: "Try something new",
          description: "Browse our catalog for your next challenge.",
          link: "/challenges",
        };
      } else {
        recommendedNext = {
          title: "SSH Key Permissions",
          description: "A great first challenge to test your Linux basics.",
          link: "/challenges/ssh-key-permissions", // Dummy fallback slug
        };
      }

      // Format badges
      const recentBadges = user.badges.slice(0, 5).map((b) => ({
        id: b.badge.id,
        title: b.badge.title,
        icon: b.badge.iconRef || "🏅",
        earnedAt: b.earnedAt.toISOString(),
      }));

      // Format activity
      const recentActivity = user.completions.slice(0, 5).map((c) => ({
        id: c.nodeId,
        description: `Completed "${c.node.title}"`,
        date: c.createdAt.toISOString(),
      }));

      // Count actual roadmaps completed (where all nodes in a path are completed by user)
      const allPaths = await prisma.learningPath.findMany({
        include: {
          modules: {
            include: { challenges: { select: { id: true } } },
          },
        },
      });

      const userCompletionNodeIds = new Set(user.completions.map((c) => c.nodeId));
      let roadmapsCompleted = 0;

      allPaths.forEach((p) => {
        const pathChallengeIds = p.modules.flatMap((m) => m.challenges.map((ch) => ch.id));
        if (pathChallengeIds.length > 0 && pathChallengeIds.every((id) => userCompletionNodeIds.has(id))) {
          roadmapsCompleted++;
        }
      });

      // Org stats
      let orgData = null;
      if (user.org) {
        const teammateCount = await prisma.user.count({ where: { orgId: user.orgId } });
        orgData = {
          name: user.org.name,
          teammateCount: Math.max(0, teammateCount - 1), // Exclude self
        };
      }

      const firstChallenge = await prisma.challenge.findFirst({
        orderBy: { createdAt: "asc" },
      });

      // Check if today's challenge was completed today
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const completedToday = firstChallenge
        ? user.completions.some(
            (c) => c.nodeId === firstChallenge.id && new Date(c.createdAt) >= startOfToday
          )
        : false;

      const defaultDailyChallenge = await prisma.challenge.findFirst({
        orderBy: { createdAt: "asc" },
      });

      const dashboardData = {
        hasActivity,
        todayChallenge: firstChallenge
          ? {
              id: firstChallenge.id,
              title: firstChallenge.title,
              completedToday,
            }
          : {
              id: defaultDailyChallenge?.id || "default_challenge",
              title: defaultDailyChallenge?.title || "Fix the Broken Nginx Config",
              completedToday: false,
            },
        inProgress,
        stats: {
          xp: user.xp,
          streak: user.currentStreak,
          longestStreak: user.longestStreak,
          roadmapsCompleted,
          badgesEarned: user.badges.length,
        },
        recommendedNext,
        recentBadges,
        recentActivity,
        org: orgData,
      };

      return reply.send(dashboardData);
    }
  );

  app.get("/me/roadmaps/:slug/progress", { preValidation: [app.authenticate] }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const userId = request.user?.sub || request.user?.id;

    const path = await app.prisma.learningPath.findUnique({
      where: { slug },
      include: {
        modules: {
          include: {
            challenges: { select: { id: true } },
          },
        },
      },
    });

    if (!path) {
      return reply.code(404).send({ error: "Learning path not found" });
    }

    const challengeIds = path.modules.flatMap((m) => m.challenges.map((c) => c.id));
    const completions = await app.prisma.completion.findMany({
      where: {
        userId,
        nodeId: { in: challengeIds },
      },
      select: { nodeId: true },
    });

    const completedNodes = completions.map((c) => c.nodeId);
    return reply.send({ completedNodes, inProgressNodes: [] });
  });

  app.get("/me/quizzes/:slug/progress", { preValidation: [app.authenticate] }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const userId = request.user?.sub || request.user?.id;

    const node = await app.prisma.node.findFirst({
      where: { OR: [{ id: slug }, { metadata: { path: ["slug"], equals: slug } }], type: "QUIZ" },
    });
    if (!node) return reply.code(404).send({ error: "Quiz not found" });

    const attempt = await app.prisma.quizAttempt.findFirst({
      where: { userId, nodeId: node.id },
      orderBy: { createdAt: "desc" },
    });

    return reply.send({
      quizId: node.id,
      status: attempt?.passed ? "Completed" : attempt ? "In progress" : "Not started",
      score: attempt?.score,
      total: attempt?.total,
    });
  });

  app.get("/me/quizzes/:slug/history", { preValidation: [app.authenticate] }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const userId = request.user?.sub || request.user?.id;

    const node = await app.prisma.node.findFirst({
      where: { OR: [{ id: slug }, { metadata: { path: ["slug"], equals: slug } }], type: "QUIZ" },
    });
    if (!node) return reply.code(404).send({ error: "Quiz not found" });

    const attempts = await app.prisma.quizAttempt.findMany({
      where: { userId, nodeId: node.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const history = attempts.map(a => ({
      id: a.id,
      description: `Scored ${a.score}/${a.total} on ${node.title}`,
      date: a.createdAt.toISOString(),
      metadata: { passed: a.passed, score: a.score, total: a.total },
    }));

    return reply.send(history);
  });

  app.get("/me/challenges/:id/history", { preValidation: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user?.sub || request.user?.id;

    const submissions = await app.prisma.submission.findMany({
      where: { userId, challengeId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const history = submissions.map(s => ({
      id: s.id,
      description: `Submission ${s.status}`,
      date: s.createdAt.toISOString(),
      metadata: { status: s.status, result: s.result },
    }));

    return reply.send(history);
  });

  app.get("/me/history", { preValidation: [app.authenticate] }, async (request, reply) => {
    const userId = request.user?.sub || request.user?.id;

    const completions = await app.prisma.completion.findMany({
      where: { userId },
      include: { node: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    
    const submissions = await app.prisma.submission.findMany({
      where: { userId },
      include: { challenge: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    const history = [
      ...completions.map(c => ({
        id: `comp_${c.nodeId}`,
        description: `Completed "${c.node.title}"`,
        date: c.createdAt.toISOString(),
      })),
      ...submissions.map(s => ({
        id: s.id,
        description: `Submitted challenge "${s.challenge.title}" - ${s.status}`,
        date: s.createdAt.toISOString(),
      })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 50);

    return reply.send(history);
  });

  app.get("/me/profile", { preValidation: [app.authenticate] }, async (request, reply) => {
    const userId = request.user?.sub || request.user?.id;
    const user = await app.prisma.user.findUnique({
      where: { id: userId },
      include: {
        badges: {
          include: { badge: true },
        },
        org: true,
      },
    });

    if (!user) {
      return reply.code(404).send({ error: "User not found" });
    }

    return reply.send({
      id: user.id,
      email: user.email,
      name: user.name,
      xp: user.xp,
      jobTitle: user.jobTitle || "",
      currentStreak: user.currentStreak,
      badges: user.badges.map((b) => ({
        id: b.badgeId,
        title: b.badge.title,
        description: b.badge.description,
        icon: b.badge.iconRef,
        earnedAt: b.earnedAt,
      })),
      org: user.org,
    });
  });

  app.put("/me/profile", { preValidation: [app.authenticate] }, async (request, reply) => {
    const userId = request.user?.sub || request.user?.id;
    const body = request.body as { name?: string; jobTitle?: string };

    const updated = await app.prisma.user.update({
      where: { id: userId },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.jobTitle !== undefined && { jobTitle: body.jobTitle }),
      },
    });

    return reply.send({
      id: updated.id,
      email: updated.email,
      name: updated.name,
      jobTitle: updated.jobTitle,
      xp: updated.xp,
    });
  });
};

