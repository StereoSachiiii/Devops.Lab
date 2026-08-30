import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

interface CreateListBody {
  name: string;
  description?: string;
  isPublic?: boolean;
}

interface AddListItemBody {
  challengeId: string;
}

export async function challengeListRoutes(fastify: FastifyInstance) {
  // GET /api/lists — list all user's custom lists
  fastify.get(
    "/lists",
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = (request.user as { sub?: string; id?: string })?.sub || (request.user as { sub?: string; id?: string })?.id;
      if (!userId) return reply.status(401).send({ error: "Unauthorized" });

      try {
        const lists = await request.prisma.challengeList.findMany({
          where: { userId },
          include: {
            items: {
              include: {
                challenge: {
                  select: { id: true, title: true, difficulty: true, category: true, xp: true },
                },
              },
              orderBy: { order: "asc" },
            },
          },
          orderBy: { createdAt: "desc" },
        });

        return reply.send({
          lists: lists.map((l) => ({
            id: l.id,
            name: l.name,
            description: l.description,
            isPublic: l.isPublic,
            createdAt: l.createdAt,
            updatedAt: l.updatedAt,
            itemCount: l.items.length,
            items: l.items.map((i) => ({
              id: i.id,
              challengeId: i.challengeId,
              order: i.order,
              challenge: i.challenge,
            })),
          })),
        });
      } catch (err) {
        fastify.log.error(err);
        return reply.status(500).send({ error: "Failed to fetch custom lists" });
      }
    }
  );

  // POST /api/lists — create a new named custom challenge list
  fastify.post(
    "/lists",
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = (request.user as { sub?: string; id?: string })?.sub || (request.user as { sub?: string; id?: string })?.id;
      if (!userId) return reply.status(401).send({ error: "Unauthorized" });

      const { name, description, isPublic = false } = (request.body || {}) as CreateListBody;
      if (!name || !name.trim()) {
        return reply.status(400).send({ error: "List name is required" });
      }

      try {
        const existing = await request.prisma.challengeList.findUnique({
          where: { userId_name: { userId, name: name.trim() } },
        });

        if (existing) {
          return reply.status(409).send({ error: "A list with this name already exists", code: "DUPLICATE_NAME" });
        }

        const newList = await request.prisma.challengeList.create({
          data: {
            userId,
            name: name.trim(),
            description: description?.trim() || null,
            isPublic,
          },
        });

        return reply.status(201).send(newList);
      } catch (err) {
        fastify.log.error(err);
        return reply.status(500).send({ error: "Failed to create custom list" });
      }
    }
  );

  // GET /api/lists/:id — get single list with all challenges
  fastify.get("/lists/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    let currentUserId: string | undefined;
    try {
      await request.jwtVerify();
      currentUserId = (request.user as { sub?: string; id?: string })?.sub || (request.user as { sub?: string; id?: string })?.id;
    } catch {}

    try {
      const list = await request.prisma.challengeList.findUnique({
        where: { id },
        include: {
          user: { select: { id: true, name: true, username: true, avatarUrl: true } },
          items: {
            include: {
              challenge: {
                select: { id: true, title: true, difficulty: true, category: true, xp: true, tags: true },
              },
            },
            orderBy: { order: "asc" },
          },
        },
      });

      if (!list) return reply.status(404).send({ error: "List not found" });

      // If private, only owner can view
      if (!list.isPublic && list.userId !== currentUserId) {
        return reply.status(403).send({ error: "Access denied to private list" });
      }

      return reply.send({
        id: list.id,
        name: list.name,
        description: list.description,
        isPublic: list.isPublic,
        author: list.user,
        createdAt: list.createdAt,
        updatedAt: list.updatedAt,
        itemCount: list.items.length,
        items: list.items.map((i) => ({
          id: i.id,
          challengeId: i.challengeId,
          order: i.order,
          challenge: i.challenge,
        })),
      });
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: "Failed to fetch list details" });
    }
  });

  // POST /api/lists/:id/items — add challenge to custom list
  fastify.post(
    "/lists/:id/items",
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id: listId } = request.params as { id: string };
      const userId = (request.user as { sub?: string; id?: string })?.sub || (request.user as { sub?: string; id?: string })?.id;
      if (!userId) return reply.status(401).send({ error: "Unauthorized" });

      const { challengeId } = (request.body || {}) as AddListItemBody;
      if (!challengeId) return reply.status(400).send({ error: "challengeId is required" });

      try {
        const list = await request.prisma.challengeList.findUnique({ where: { id: listId } });
        if (!list) return reply.status(404).send({ error: "List not found" });
        if (list.userId !== userId) return reply.status(403).send({ error: "Forbidden" });

        const challenge = await request.prisma.challenge.findUnique({ where: { id: challengeId } });
        if (!challenge) return reply.status(404).send({ error: "Challenge not found" });

        const count = await request.prisma.challengeListItem.count({ where: { listId } });

        const item = await request.prisma.challengeListItem.upsert({
          where: { listId_challengeId: { listId, challengeId } },
          update: {},
          create: {
            listId,
            challengeId,
            order: count,
          },
        });

        return reply.status(201).send(item);
      } catch (err) {
        fastify.log.error(err);
        return reply.status(500).send({ error: "Failed to add challenge to list" });
      }
    }
  );

  // DELETE /api/lists/:id/items/:challengeId — remove challenge from list
  fastify.delete(
    "/lists/:id/items/:challengeId",
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id: listId, challengeId } = request.params as { id: string; challengeId: string };
      const userId = (request.user as { sub?: string; id?: string })?.sub || (request.user as { sub?: string; id?: string })?.id;
      if (!userId) return reply.status(401).send({ error: "Unauthorized" });

      try {
        const list = await request.prisma.challengeList.findUnique({ where: { id: listId } });
        if (!list) return reply.status(404).send({ error: "List not found" });
        if (list.userId !== userId) return reply.status(403).send({ error: "Forbidden" });

        await request.prisma.challengeListItem.deleteMany({
          where: { listId, challengeId },
        });

        return reply.send({ success: true, message: "Removed from list" });
      } catch (err) {
        fastify.log.error(err);
        return reply.status(500).send({ error: "Failed to remove challenge from list" });
      }
    }
  );

  // DELETE /api/lists/:id — delete custom list
  fastify.delete(
    "/lists/:id",
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const userId = (request.user as { sub?: string; id?: string })?.sub || (request.user as { sub?: string; id?: string })?.id;
      if (!userId) return reply.status(401).send({ error: "Unauthorized" });

      try {
        const list = await request.prisma.challengeList.findUnique({ where: { id } });
        if (!list) return reply.status(404).send({ error: "List not found" });
        if (list.userId !== userId) return reply.status(403).send({ error: "Forbidden" });

        await request.prisma.challengeList.delete({ where: { id } });
        return reply.send({ success: true, message: "List deleted" });
      } catch (err) {
        fastify.log.error(err);
        return reply.status(500).send({ error: "Failed to delete list" });
      }
    }
  );
}
