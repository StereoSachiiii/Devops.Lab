import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

export async function leaderboardRoutes(fastify: FastifyInstance) {
  // GET /api/leaderboard — supports ?category=KUBERNETES&timeframe=all-time&orgId=...
  fastify.get("/leaderboard", async (request: FastifyRequest, reply: FastifyReply) => {
    const query = (request.query || {}) as {
      category?: string;
      orgId?: string;
      limit?: string;
    };

    const limit = Math.min(100, Math.max(1, parseInt(query.limit || "50", 10) || 50));
    const category = query.category?.toUpperCase();
    const orgId = query.orgId;

    try {
      if (category && ["KUBERNETES", "DOCKER", "CICD", "TERRAFORM", "BASH", "SECURITY", "MONITORING"].includes(category)) {
        // Query users with completions in specific category nodes
        const nodes = await request.prisma.node.findMany({
          where: { metadata: { path: ["category"], equals: category } },
          select: { id: true },
        });
        const nodeIds = nodes.map((n) => n.id);

        const users = await request.prisma.user.findMany({
          where: {
            isPublic: true,
            ...(orgId ? { orgId } : {}),
            completions: {
              some: {
                nodeId: { in: nodeIds },
              },
            },
          },
          select: {
            id: true,
            name: true,
            username: true,
            avatarUrl: true,
            jobTitle: true,
            xp: true,
            currentStreak: true,
            completions: {
              where: { nodeId: { in: nodeIds } },
              select: { nodeId: true },
            },
          },
          orderBy: { xp: "desc" },
          take: limit,
        });

        const ranked = users.map((u, idx) => ({
          rank: idx + 1,
          id: u.id,
          name: u.name || `@${u.username}`,
          username: u.username,
          avatarUrl: u.avatarUrl,
          jobTitle: u.jobTitle,
          xp: u.xp,
          currentStreak: u.currentStreak,
          categorySolves: u.completions.length,
        }));

        return reply.send({
          context: "CATEGORY",
          category,
          leaderboard: ranked,
          total: ranked.length,
        });
      }

      // Default Global or Org-scoped Leaderboard
      const whereClause: any = { isPublic: true };
      if (orgId) {
        whereClause.orgId = orgId;
      }

      const topUsers = await request.prisma.user.findMany({
        where: whereClause,
        select: {
          id: true,
          name: true,
          username: true,
          avatarUrl: true,
          jobTitle: true,
          xp: true,
          currentStreak: true,
          longestStreak: true,
          org: { select: { id: true, name: true, slug: true } },
          badges: { select: { badgeId: true } },
        },
        orderBy: {
          xp: "desc",
        },
        take: limit,
      });

      const ranked = topUsers.map((u, idx) => ({
        rank: idx + 1,
        id: u.id,
        name: u.name || (u.username ? `@${u.username}` : "Anonymous Engineer"),
        username: u.username,
        avatarUrl: u.avatarUrl,
        jobTitle: u.jobTitle,
        xp: u.xp,
        currentStreak: u.currentStreak,
        longestStreak: u.longestStreak,
        badgeCount: u.badges.length,
        org: u.org,
      }));

      return reply.send({
        context: orgId ? "ORGANIZATION" : "GLOBAL",
        orgId: orgId || null,
        leaderboard: ranked,
        total: ranked.length,
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: "Internal Server Error" });
    }
  });

  // GET /api/orgs/:orgId/leaderboard — org member ranking with private members visible to teammates
  fastify.get(
    "/orgs/:orgId/leaderboard",
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orgId } = request.params as { orgId: string };
      const userId = (request.user as { sub?: string; id?: string })?.sub || (request.user as { sub?: string; id?: string })?.id;
      if (!userId) return reply.status(401).send({ error: "Unauthorized" });

      try {
        // Verify caller is a member of this org
        const membership = await request.prisma.orgMember.findUnique({
          where: { userId_orgId: { userId, orgId } },
        });

        if (!membership) {
          return reply.status(403).send({ error: "Forbidden: Not a member of this organization" });
        }

        const members = await request.prisma.orgMember.findMany({
          where: { orgId },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                username: true,
                avatarUrl: true,
                jobTitle: true,
                xp: true,
                currentStreak: true,
                completions: { select: { nodeId: true } },
                badges: { select: { badgeId: true } },
              },
            },
          },
        });

        const sorted = members
          .map((m) => ({
            id: m.user.id,
            name: m.user.name || `@${m.user.username}`,
            username: m.user.username,
            avatarUrl: m.user.avatarUrl,
            jobTitle: m.user.jobTitle,
            orgRole: m.orgRole,
            xp: m.user.xp,
            currentStreak: m.user.currentStreak,
            completionsCount: m.user.completions.length,
            badgeCount: m.user.badges.length,
            joinedAt: m.joinedAt,
          }))
          .sort((a, b) => b.xp - a.xp);

        const ranked = sorted.map((item, index) => ({
          rank: index + 1,
          ...item,
        }));

        return reply.send({
          orgId,
          leaderboard: ranked,
          total: ranked.length,
        });
      } catch (err) {
        fastify.log.error(err);
        return reply.status(500).send({ error: "Failed to fetch organization leaderboard" });
      }
    }
  );
}

