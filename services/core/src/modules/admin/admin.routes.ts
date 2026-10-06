import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { Prisma, Difficulty, Category, SessionStatus, Role, PlanTier } from "@prisma/client";

export async function adminRoutes(fastify: FastifyInstance) {
  // Admin authentication / authorization middleware guard
  const requireAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ error: "Unauthorized: Valid token required" });
    }

    const userId = (request.user as { id?: string; sub?: string })?.id || (request.user as { id?: string; sub?: string })?.sub;
    if (!userId) {
      return reply.status(401).send({ error: "Unauthorized: Missing user identity" });
    }

    const user = await request.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, email: true },
    });

    if (!user || user.role !== "ADMIN") {
      return reply.status(403).send({ error: "Forbidden: Platform Administrator privileges required" });
    }

    return user;
  };

  // 1. Overview Dashboard Stats
  fastify.get("/admin/overview", async (request: FastifyRequest, reply: FastifyReply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;

    const [
      totalUsers,
      totalOrgs,
      totalChallenges,
      activeSandboxes,
      totalSubmissions,
    ] = await Promise.all([
      request.prisma.user.count(),
      request.prisma.org.count(),
      request.prisma.challenge.count(),
      request.prisma.labSession.count({ where: { status: "ACTIVE" } }),
      request.prisma.submission.count(),
    ]);

    return reply.send({
      stats: {
        totalUsers,
        totalOrgs,
        totalChallenges,
        activeSandboxes,
        totalSubmissions,
      },
      system: {
        gatewayUrl: "http://localhost:8005",
        prometheusUrl: "http://localhost:9090",
        grafanaUrl: "http://localhost:3000",
        redpandaUrl: "http://localhost:8080",
      },
    });
  });

  // 2. Users Management
  fastify.get("/admin/users", async (request: FastifyRequest<{ Querystring: { page?: string; limit?: string; search?: string; role?: string } }>, reply: FastifyReply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;

    const page = Math.max(1, parseInt(request.query.page || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(request.query.limit || "20", 10)));
    const skip = (page - 1) * limit;
    const search = request.query.search?.trim();
    const roleParam = request.query.role;

    const whereClause: Prisma.UserWhereInput = {};
    if (search) {
      whereClause.OR = [
        { email: { contains: search, mode: "insensitive" } },
        { name: { contains: search, mode: "insensitive" } },
        { username: { contains: search, mode: "insensitive" } },
      ];
    }
    if (roleParam && roleParam !== "ALL") {
      whereClause.role = roleParam as Role;
    }

    const [users, total] = await Promise.all([
      request.prisma.user.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          email: true,
          name: true,
          username: true,
          role: true,
          xp: true,
          orgId: true,
          org: { select: { id: true, name: true, slug: true } },
          createdAt: true,
          lastLoginAt: true,
        },
      }),
      request.prisma.user.count({ where: whereClause }),
    ]);

    return reply.send({
      data: users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  });

  fastify.patch("/admin/users/:id", async (request: FastifyRequest<{ Params: { id: string }; Body: { role?: Role; orgId?: string | null; name?: string } }>, reply: FastifyReply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;

    const { id } = request.params;
    const { role, orgId, name } = request.body;

    const updateData: Prisma.UserUpdateInput = {};
    if (role !== undefined) updateData.role = role;
    if (orgId !== undefined) updateData.org = orgId ? { connect: { id: orgId } } : { disconnect: true };
    if (name !== undefined) updateData.name = name;

    const updatedUser = await request.prisma.user.update({
      where: { id },
      data: updateData,
      select: { id: true, email: true, name: true, role: true, orgId: true },
    });

    return reply.send({ success: true, user: updatedUser });
  });

  fastify.delete("/admin/users/:id", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;

    const { id } = request.params;
    await request.prisma.user.delete({
      where: { id },
    });

    return reply.send({ success: true, deletedId: id });
  });

  // 3. Organizations & Enterprise SSO
  fastify.get("/admin/orgs", async (request: FastifyRequest, reply: FastifyReply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;

    const orgs = await request.prisma.org.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: { members: true, users: true, scenarios: true },
        },
      },
    });

    return reply.send({ data: orgs });
  });

  fastify.post("/admin/orgs", async (request: FastifyRequest<{ Body: { name: string; slug: string; planTier?: PlanTier; ssoDomain?: string; ssoProvider?: string; ssoMetadataUrl?: string } }>, reply: FastifyReply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;

    const { name, slug, planTier = "FREE", ssoDomain, ssoProvider, ssoMetadataUrl } = request.body;

    const org = await request.prisma.org.create({
      data: {
        name,
        slug,
        planTier,
        ssoDomain: ssoDomain ? ssoDomain.toLowerCase() : null,
        ssoProvider: ssoProvider || null,
        ssoMetadataUrl: ssoMetadataUrl || null,
      },
    });

    return reply.status(201).send({ success: true, org });
  });

  fastify.patch("/admin/orgs/:id", async (request: FastifyRequest<{ Params: { id: string }; Body: { name?: string; slug?: string; planTier?: PlanTier; ssoDomain?: string | null; ssoProvider?: string | null; ssoMetadataUrl?: string | null; seatsPurchased?: number } }>, reply: FastifyReply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;

    const { id } = request.params;
    const { name, slug, planTier, ssoDomain, ssoProvider, ssoMetadataUrl, seatsPurchased } = request.body;

    const updateData: Prisma.OrgUpdateInput = {};
    if (name !== undefined) updateData.name = name;
    if (slug !== undefined) updateData.slug = slug;
    if (planTier !== undefined) updateData.planTier = planTier;
    if (ssoDomain !== undefined) updateData.ssoDomain = ssoDomain ? ssoDomain.toLowerCase() : null;
    if (ssoProvider !== undefined) updateData.ssoProvider = ssoProvider;
    if (ssoMetadataUrl !== undefined) updateData.ssoMetadataUrl = ssoMetadataUrl;
    if (seatsPurchased !== undefined) updateData.seatsPurchased = seatsPurchased;

    const updatedOrg = await request.prisma.org.update({
      where: { id },
      data: updateData,
    });

    return reply.send({ success: true, org: updatedOrg });
  });

  fastify.delete("/admin/orgs/:id", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;

    const { id } = request.params;
    await request.prisma.org.delete({ where: { id } });
    return reply.send({ success: true, deletedId: id });
  });

  // 4. Challenges Catalog
  fastify.get("/admin/challenges", async (request: FastifyRequest, reply: FastifyReply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;

    const challenges = await request.prisma.challenge.findMany({
      orderBy: { id: "desc" },
      include: {
        _count: {
          select: { sessions: true, submissions: true, comments: true },
        },
      },
    });

    return reply.send({ data: challenges });
  });

  fastify.post("/admin/challenges", async (request: FastifyRequest<{ Body: { title: string; slug?: string; description: string; difficulty: Difficulty; category: Category; dockerImage: string; xp?: number; tags?: string[] } }>, reply: FastifyReply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;

    const { title, slug, description, difficulty, category, dockerImage, xp = 100, tags = [] } = request.body;

    const challenge = await request.prisma.challenge.create({
      data: {
        title,
        slug: slug ? slug : null,
        description,
        difficulty,
        category,
        dockerImage,
        xp,
        tags,
      },
    });

    return reply.status(201).send({ success: true, challenge });
  });

  fastify.patch("/admin/challenges/:id", async (request: FastifyRequest<{ Params: { id: string }; Body: { title?: string; slug?: string; description?: string; difficulty?: Difficulty; category?: Category; dockerImage?: string; xp?: number; tags?: string[] } }>, reply: FastifyReply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;

    const { id } = request.params;
    const { title, slug, description, difficulty, category, dockerImage, xp, tags } = request.body;

    const updateData: Prisma.ChallengeUpdateInput = {};
    if (title !== undefined) updateData.title = title;
    if (slug !== undefined) updateData.slug = slug;
    if (description !== undefined) updateData.description = description;
    if (difficulty !== undefined) updateData.difficulty = difficulty;
    if (category !== undefined) updateData.category = category;
    if (dockerImage !== undefined) updateData.dockerImage = dockerImage;
    if (xp !== undefined) updateData.xp = xp;
    if (tags !== undefined) updateData.tags = tags;

    const updatedChallenge = await request.prisma.challenge.update({
      where: { id },
      data: updateData,
    });

    return reply.send({ success: true, challenge: updatedChallenge });
  });

  fastify.delete("/admin/challenges/:id", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;

    const { id } = request.params;
    await request.prisma.challenge.delete({ where: { id } });
    return reply.send({ success: true, deletedId: id });
  });

  // 5. Active Sandboxes Control
  fastify.get("/admin/sandboxes", async (request: FastifyRequest, reply: FastifyReply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;

    const sessions = await request.prisma.labSession.findMany({
      where: {
        status: "ACTIVE",
      },
      orderBy: { startedAt: "desc" },
      include: {
        user: { select: { id: true, email: true, name: true } },
        challenge: { select: { id: true, title: true, slug: true, dockerImage: true } },
      },
      take: 50,
    });

    return reply.send({ data: sessions });
  });

  fastify.post("/admin/sandboxes/:id/terminate", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;

    const { id } = request.params;
    const session = await request.prisma.labSession.update({
      where: { id },
      data: { status: "TERMINATED" as SessionStatus, endedAt: new Date() },
    });

    return reply.send({ success: true, session });
  });
}
