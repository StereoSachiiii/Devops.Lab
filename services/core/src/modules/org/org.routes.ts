import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

interface CreateOrgBody {
  name: string;
  slug: string;
  planTier?: "FREE" | "PRO" | "TEAM";
}

interface InviteMemberBody {
  email: string;
  orgRole?: "OWNER" | "ADMIN" | "MEMBER";
}

interface CreateScenarioBody {
  title: string;
  description: string;
  difficulty: "JUNIOR" | "MID" | "SENIOR";
  category: "KUBERNETES" | "DOCKER" | "CICD" | "TERRAFORM" | "BASH" | "SECURITY" | "MONITORING";
  dockerImage: string;
  setupInstructions: string;
  checks: Array<{
    checkId: string;
    description: string;
    passCriteria: string;
  }>;
}

export async function orgRoutes(fastify: FastifyInstance) {
  // Guard helper to check if user has access to a specific org
  const checkOrgAccess = async (request: FastifyRequest, reply: FastifyReply, orgId: string, minRole?: "OWNER" | "ADMIN") => {
    const userId = request.user?.id || request.user?.sub;
    if (!userId) {
      reply.status(401).send({ error: "Unauthorized" });
      return null;
    }

    const membership = await request.prisma.orgMember.findUnique({
      where: {
        userId_orgId: { userId, orgId }
      }
    });

    if (!membership) {
      reply.status(403).send({ error: "Forbidden: Not a member of this organization" });
      return null;
    }

    if (minRole === "OWNER" && membership.orgRole !== "OWNER") {
      reply.status(403).send({ error: "Forbidden: Owner access required" });
      return null;
    }

    if (minRole === "ADMIN" && membership.orgRole !== "OWNER" && membership.orgRole !== "ADMIN") {
      reply.status(403).send({ error: "Forbidden: Admin access required" });
      return null;
    }

    return membership;
  };

  // POST /api/orgs
  fastify.post(
    "/orgs",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const userId = (request.user?.id || request.user?.sub)!;
      const { name, slug, planTier } = request.body as CreateOrgBody;

      if (!name || !slug) {
        return reply.status(400).send({ error: "Name and Slug are required" });
      }

      try {
        const existing = await request.prisma.org.findUnique({ where: { slug } });
        if (existing) {
          return reply.status(409).send({ error: "Slug is already in use" });
        }

        const result = await request.prisma.$transaction(async (tx) => {
          // Create organization
          const org = await tx.org.create({
            data: {
              name,
              slug,
              planTier: planTier || "FREE",
              seatsPurchased: planTier === "TEAM" ? 50 : planTier === "PRO" ? 5 : 1,
            },
          });

          // Create membership
          await tx.orgMember.create({
            data: {
              userId,
              orgId: org.id,
              orgRole: "OWNER",
            },
          });

          // Associate user with orgId
          await tx.user.update({
            where: { id: userId },
            data: { orgId: org.id },
          });

          return org;
        });

        return reply.status(201).send(result);
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({ error: "Failed to create organization" });
      }
    }
  );

  // GET /api/orgs/me
  fastify.get(
    "/orgs/me",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const userId = (request.user?.id || request.user?.sub)!;

      try {
        const user = await request.prisma.user.findUnique({
          where: { id: userId },
          include: { org: true },
        });

        if (!user || !user.org) {
          return reply.status(404).send({ error: "Not a member of any organization" });
        }

        const membership = await request.prisma.orgMember.findUnique({
          where: {
            userId_orgId: { userId, orgId: user.orgId! },
          },
        });

        return reply.send({
          ...user.org,
          myRole: membership?.orgRole || "MEMBER",
        });
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({ error: "Failed to fetch organization details" });
      }
    }
  );

  // GET /api/orgs/:orgId/members
  fastify.get(
    "/orgs/:orgId/members",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      let { orgId } = request.params as { orgId: string };

      if (orgId === "me") {
        const user = await request.prisma.user.findUnique({ select: { orgId: true }, where: { id: request.user!.id } });
        if (!user || !user.orgId) return reply.status(404).send({ error: "Not a member of any organization" });
        orgId = user.orgId;
      }

      const access = await checkOrgAccess(request, reply, orgId);
      if (!access) return;

      try {
        const members = await request.prisma.orgMember.findMany({
          where: { orgId },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
                xp: true,
                jobTitle: true,
                sessions: {
                  where: { status: "ACTIVE" },
                  take: 1,
                  select: { challenge: { select: { title: true } } },
                },
              },
            },
          },
        });

        const formatted = members.map((m) => ({
          id: m.user.id,
          name: m.user.name || m.user.email,
          role: m.user.jobTitle || "Engineer",
          orgRole: m.orgRole,
          status: m.user.sessions.length > 0 ? "Active" : "Inactive",
          currentSandbox: m.user.sessions[0]?.challenge.title || "-",
          score: m.user.xp,
        }));

        return reply.send(formatted);
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({ error: "Failed to fetch members" });
      }
    }
  );

  // POST /api/orgs/:orgId/invites
  fastify.post(
    "/orgs/:orgId/invites",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      let { orgId } = request.params as { orgId: string };
      const { email, orgRole } = request.body as InviteMemberBody;

      if (orgId === "me") {
        const uid = (request.user?.id || request.user?.sub)!;
        const user = await request.prisma.user.findUnique({ select: { orgId: true }, where: { id: uid } });
        if (!user || !user.orgId) return reply.status(404).send({ error: "Not a member of any organization" });
        orgId = user.orgId;
      }

      const access = await checkOrgAccess(request, reply, orgId, "ADMIN");
      if (!access) return;

      if (!email) {
        return reply.status(400).send({ error: "Email is required" });
      }

      try {
        // Enforce seat limits
        const org = await request.prisma.org.findUnique({
          where: { id: orgId },
          include: { _count: { select: { members: true } } },
        });

        if (org && org._count.members >= org.seatsPurchased) {
          return reply.status(409).send({ error: "Seat capacity reached. Please upgrade your plan." });
        }

        const invite = await request.prisma.orgInvite.create({
          data: {
            orgId,
            email,
            orgRole: orgRole || "MEMBER",
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days expiry
          },
        });

        // Store invite notification in Outbox for dispatching
        await request.prisma.coreOutboxEvent.create({
          data: {
            eventType: "org.invite.sent",
            payload: {
              inviteId: invite.id,
              orgId,
              email,
              token: invite.token,
            },
          },
        });

        return reply.status(201).send({
          success: true,
          message: "Invitation sent successfully",
          invite,
        });
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({ error: "Failed to send invitation" });
      }
    }
  );

  // GET /api/orgs/:orgId/analytics
  fastify.get(
    "/orgs/:orgId/analytics",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      let { orgId } = request.params as { orgId: string };

      if (orgId === "me") {
        const user = await request.prisma.user.findUnique({ select: { orgId: true }, where: { id: request.user!.id } });
        if (!user || !user.orgId) return reply.status(404).send({ error: "Not a member of any organization" });
        orgId = user.orgId;
      }

      const access = await checkOrgAccess(request, reply, orgId, "ADMIN");
      if (!access) return;

      try {
        const members = await request.prisma.orgMember.findMany({
          where: { orgId },
          include: {
            user: {
              select: {
                xp: true,
                sessions: {
                  select: { status: true, challenge: { select: { xp: true } } },
                },
                completions: true,
              },
            },
          },
        });

        const totalEngineers = members.length;
        let activeSandboxes = 0;
        let totalXp = 0;
        let pathsCompleted = 0;

        const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        let engineersAddedThisMonth = 0;

        members.forEach((m) => {
          totalXp += m.user.xp;
          activeSandboxes += m.user.sessions.filter((s) => s.status === "ACTIVE").length;
          pathsCompleted += m.user.completions.length;
          if (m.joinedAt && m.joinedAt >= oneMonthAgo) {
            engineersAddedThisMonth++;
          }
        });

        const avgSkillScore = totalEngineers > 0 ? Math.round(totalXp / totalEngineers) : 0;

        return reply.send({
          totalEngineers,
          activeSandboxes,
          highResourceSandboxes: activeSandboxes,
          avgSkillScore,
          pathsCompleted,
          pathsCompletedThisWeek: members.reduce((acc, m) => acc + m.user.completions.filter((c) => c.createdAt >= oneWeekAgo).length, 0),
          scoreChangeLastWeek: 0,
          engineersAddedThisMonth,
        });
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({ error: "Failed to fetch analytics" });
      }
    }
  );

  // GET /api/orgs/:orgId/scenarios
  fastify.get(
    "/orgs/:orgId/scenarios",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      let { orgId } = request.params as { orgId: string };

      if (orgId === "me") {
        const uid = (request.user?.id || request.user?.sub)!;
        const user = await request.prisma.user.findUnique({ select: { orgId: true }, where: { id: uid } });
        if (!user || !user.orgId) return reply.status(404).send({ error: "Not a member of any organization" });
        orgId = user.orgId;
      }

      const access = await checkOrgAccess(request, reply, orgId);
      if (!access) return;

      try {
        const scenarios = await request.prisma.orgScenario.findMany({
          where: { orgId },
          orderBy: { createdAt: "desc" },
        });

        return reply.send(scenarios);
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({ error: "Failed to fetch scenarios" });
      }
    }
  );

  // POST /api/orgs/:orgId/scenarios
  fastify.post(
    "/orgs/:orgId/scenarios",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      let { orgId } = request.params as { orgId: string };
      const body = request.body as CreateScenarioBody;

      if (orgId === "me") {
        const uid = (request.user?.id || request.user?.sub)!;
        const user = await request.prisma.user.findUnique({ select: { orgId: true }, where: { id: uid } });
        if (!user || !user.orgId) return reply.status(404).send({ error: "Not a member of any organization" });
        orgId = user.orgId;
      }

      const access = await checkOrgAccess(request, reply, orgId, "ADMIN");
      if (!access) return;

      if (!body.title || !body.description || !body.dockerImage) {
        return reply.status(400).send({ error: "Title, Description, and Docker Image are required" });
      }

      try {
        const scenario = await request.prisma.orgScenario.create({
          data: {
            orgId,
            createdByUserId: request.user!.id,
            title: body.title,
            description: body.description,
            difficulty: body.difficulty || "MID",
            category: body.category || "KUBERNETES",
            dockerImage: body.dockerImage,
            setupInstructions: body.setupInstructions || "",
            checks: body.checks || [],
            status: "PRIVATE",
          },
        });

        return reply.status(201).send(scenario);
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({ error: "Failed to create scenario" });
      }
    }
  );

  // POST /api/orgs/join/:token
  fastify.post(
    "/orgs/join/:token",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { token } = request.params as { token: string };
      const userId = (request.user?.id || request.user?.sub)!;

      try {
        const invite = await request.prisma.orgInvite.findUnique({
          where: { token },
        });

        if (!invite) {
          return reply.status(404).send({ error: "Invitation not found" });
        }

        if (invite.status !== "PENDING") {
          return reply.status(400).send({ error: `Invitation is already ${invite.status.toLowerCase()}` });
        }

        if (invite.expiresAt < new Date()) {
          await request.prisma.orgInvite.update({
            where: { id: invite.id },
            data: { status: "EXPIRED" },
          });
          return reply.status(410).send({ error: "Invitation has expired" });
        }

        // Perform join in transaction
        await request.prisma.$transaction(async (tx) => {
          // 1. Update User orgId reference
          await tx.user.update({
            where: { id: userId },
            data: { orgId: invite.orgId },
          });

          // 2. Create OrgMember junction table entry
          await tx.orgMember.create({
            data: {
              userId,
              orgId: invite.orgId,
              orgRole: invite.orgRole,
            },
          });

          // 3. Mark invite accepted
          await tx.orgInvite.update({
            where: { id: invite.id },
            data: { status: "ACCEPTED" },
          });

          // 4. Fire notification outbox event
          await tx.coreOutboxEvent.create({
            data: {
              eventType: "org.member.joined",
              payload: {
                userId,
                orgId: invite.orgId,
                orgRole: invite.orgRole,
              },
            },
          });
        });

        return reply.send({ success: true, message: "Successfully joined organization" });
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({ error: "Failed to join organization" });
      }
    }
  );

  // GET /api/orgs/:orgId/assignments
  fastify.get(
    "/orgs/:orgId/assignments",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      let { orgId } = request.params as { orgId: string };

      if (orgId === "me") {
        const uid = (request.user?.id || request.user?.sub)!;
        const user = await request.prisma.user.findUnique({ select: { orgId: true }, where: { id: uid } });
        if (!user || !user.orgId) return reply.status(404).send({ error: "Not a member of any organization" });
        orgId = user.orgId;
      }

      const access = await checkOrgAccess(request, reply, orgId);
      if (!access) return;

      try {
        const assignments = await request.prisma.pathAssignment.findMany({
          where: { orgId },
          include: { learningPath: true },
        });

        return reply.send(assignments);
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({ error: "Failed to fetch path assignments" });
      }
    }
  );

  // POST /api/orgs/:orgId/assignments
  fastify.post(
    "/orgs/:orgId/assignments",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      let { orgId } = request.params as { orgId: string };
      const { learningPathId, userId } = request.body as { learningPathId: string; userId?: string };

      if (orgId === "me") {
        const uid = (request.user?.id || request.user?.sub)!;
        const user = await request.prisma.user.findUnique({ select: { orgId: true }, where: { id: uid } });
        if (!user || !user.orgId) return reply.status(404).send({ error: "Not a member of any organization" });
        orgId = user.orgId;
      }

      const access = await checkOrgAccess(request, reply, orgId, "ADMIN");
      if (!access) return;

      if (!learningPathId) {
        return reply.status(400).send({ error: "learningPathId is required" });
      }

      try {
        const assignedByUserId = (request.user?.id || request.user?.sub)!;
        const assignment = await request.prisma.pathAssignment.upsert({
          where: {
            orgId_learningPathId_userId: {
              orgId,
              learningPathId,
              userId: userId || null as any,
            },
          },
          update: { assignedAt: new Date() },
          create: {
            orgId,
            learningPathId,
            userId: userId || null,
            assignedByUserId,
          },
        });

        return reply.status(201).send({ success: true, assignment });
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({ error: "Failed to create path assignment" });
      }
    }
  );

  // GET /api/orgs/:orgId/assignments/matrix — granular engineer-by-path progress matrix
  fastify.get(
    "/orgs/:orgId/assignments/matrix",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      let { orgId } = request.params as { orgId: string };

      if (orgId === "me") {
        const uid = (request.user?.id || request.user?.sub)!;
        const user = await request.prisma.user.findUnique({ select: { orgId: true }, where: { id: uid } });
        if (!user || !user.orgId) return reply.status(404).send({ error: "Not a member of any organization" });
        orgId = user.orgId;
      }

      const access = await checkOrgAccess(request, reply, orgId, "ADMIN");
      if (!access) return;

      try {
        const [members, assignments] = await Promise.all([
          request.prisma.orgMember.findMany({
            where: { orgId },
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  jobTitle: true,
                  xp: true,
                  completions: { select: { nodeId: true, createdAt: true } },
                },
              },
            },
          }),
          request.prisma.pathAssignment.findMany({
            where: { orgId },
            include: {
              learningPath: {
                include: {
                  modules: {
                    include: {
                      challenges: { select: { id: true, title: true, xp: true } },
                    },
                  },
                },
              },
            },
          }),
        ]);

        const matrix = members.map((m) => {
          const userCompletions = new Set(m.user.completions.map((c) => c.nodeId));

          const pathProgress = assignments.map((a) => {
            const allChallenges = a.learningPath.modules.flatMap((mod) => mod.challenges);
            const total = allChallenges.length;
            const completedCount = allChallenges.filter((ch) => userCompletions.has(ch.id)).length;
            const percentage = total > 0 ? Math.round((completedCount / total) * 100) : 0;

            return {
              pathId: a.learningPath.id,
              pathTitle: a.learningPath.title,
              totalChallenges: total,
              completedChallenges: completedCount,
              percentage,
              status: percentage === 100 ? "COMPLETED" : percentage > 0 ? "IN_PROGRESS" : "NOT_STARTED",
            };
          });

          return {
            userId: m.user.id,
            name: m.user.name || m.user.email,
            email: m.user.email,
            role: m.user.jobTitle || "Engineer",
            orgRole: m.orgRole,
            xp: m.user.xp,
            assignments: pathProgress,
          };
        });

        return reply.send(matrix);
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({ error: "Failed to fetch assignment progress matrix" });
      }
    }
  );

  // GET /api/orgs/:orgId/compliance-export — export compliance training completion CSV
  fastify.get(
    "/orgs/:orgId/compliance-export",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      let { orgId } = request.params as { orgId: string };

      if (orgId === "me") {
        const uid = (request.user?.id || request.user?.sub)!;
        const user = await request.prisma.user.findUnique({ select: { orgId: true }, where: { id: uid } });
        if (!user || !user.orgId) return reply.status(404).send({ error: "Not a member of any organization" });
        orgId = user.orgId;
      }

      const access = await checkOrgAccess(request, reply, orgId, "ADMIN");
      if (!access) return;

      try {
        const org = await request.prisma.org.findUnique({ where: { id: orgId }, select: { name: true } });
        const members = await request.prisma.orgMember.findMany({
          where: { orgId },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                jobTitle: true,
                xp: true,
                completions: {
                  include: {
                    node: { select: { title: true, type: true } },
                  },
                },
              },
            },
          },
        });

        // Generate RFC 4180 compliant CSV header and rows
        const headers = ["Organization", "Engineer Name", "Email", "Role", "Org Role", "XP", "Completed Unit", "Type", "Completed At"];
        const rows: string[][] = [];

        members.forEach((m) => {
          if (m.user.completions.length === 0) {
            rows.push([
              `"${org?.name || "Org"}"`,
              `"${m.user.name || ""}"`,
              `"${m.user.email}"`,
              `"${m.user.jobTitle || "Engineer"}"`,
              `"${m.orgRole}"`,
              `${m.user.xp}`,
              `"None"`,
              `"N/A"`,
              `"N/A"`,
            ]);
          } else {
            m.user.completions.forEach((comp) => {
              rows.push([
                `"${org?.name || "Org"}"`,
                `"${m.user.name || ""}"`,
                `"${m.user.email}"`,
                `"${m.user.jobTitle || "Engineer"}"`,
                `"${m.orgRole}"`,
                `${m.user.xp}`,
                `"${comp.node.title.replace(/"/g, '""')}"`,
                `"${comp.node.type}"`,
                `"${comp.createdAt.toISOString()}"`,
              ]);
            });
          }
        });

        const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");

        reply.header("Content-Type", "text/csv");
        reply.header("Content-Disposition", `attachment; filename="training_compliance_${orgId}.csv"`);
        return reply.send(csvContent);
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({ error: "Failed to generate compliance export" });
      }
    }
  );
}

