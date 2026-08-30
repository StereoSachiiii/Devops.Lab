import type { FastifyInstance } from "fastify";
import type { Article } from "@devops/types";

export async function articleRoutes(fastify: FastifyInstance) {
  // GET /articles — list with DB search & category filters
  fastify.get("/articles", async (request, reply) => {
    const { query, category, tag } = request.query as {
      query?: string;
      category?: string;
      tag?: string;
    };

    try {
      const where: any = {};
      if (category && category !== "all") {
        where.category = { equals: category, mode: "insensitive" };
      }
      if (tag) {
        where.tags = { has: tag };
      }
      if (query && query.trim() !== "") {
        where.OR = [
          { title: { contains: query.trim(), mode: "insensitive" } },
          { summary: { contains: query.trim(), mode: "insensitive" } },
          { content: { contains: query.trim(), mode: "insensitive" } },
        ];
      }

      const articles = await request.prisma.article.findMany({
        where,
        orderBy: { publishedAt: "desc" },
        include: { _count: { select: { likesList: true } } },
      });

      return reply.send(articles.map((a) => ({ ...a, likes: a._count.likesList })));
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: "Failed to fetch articles from database", code: "DB_ERROR" });
    }
  });

  // GET /articles/:slug — retrieve full article details from DB with like/save state
  fastify.get("/articles/:slug", async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const userId = (request as any).user?.sub as string | undefined;

    try {
      const article = await request.prisma.article.findFirst({
        where: { OR: [{ slug }, { id: slug }] },
        include: {
          _count: { select: { likesList: true, bookmarks: true } },
        },
      });

      if (!article) {
        return reply.code(404).send({ error: `Article '${slug}' not found`, code: "NOT_FOUND" });
      }

      let liked = false;
      let saved = false;
      if (userId) {
        const [likeRow, bookmarkRow] = await Promise.all([
          request.prisma.articleLike.findUnique({
            where: { articleId_userId: { articleId: article.id, userId } },
          }),
          request.prisma.articleBookmark.findUnique({
            where: { articleId_userId: { articleId: article.id, userId } },
          }),
        ]);
        liked = !!likeRow;
        saved = !!bookmarkRow;
      }

      return reply.send({
        ...article,
        likes: article._count.likesList,
        saves: article._count.bookmarks,
        liked,
        saved,
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: "Failed to fetch article from database", code: "DB_ERROR" });
    }
  });

  // POST /articles — create a new article in DB (Editorial)
  fastify.post(
    "/articles",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const user = request.user;
      if (!user || (user.role !== "ADMIN" && user.role !== "CONTRIBUTOR")) {
        return reply.code(403).send({ error: "Only admins and contributors can create articles", code: "FORBIDDEN" });
      }

      const body = request.body as Partial<Article>;
      if (!body.title || !body.summary || !body.content) {
        return reply.code(400).send({ error: "title, summary, and content are required", code: "VALIDATION_ERROR" });
      }

      const slug =
        body.slug ||
        body.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "");

    try {
      const created = await request.prisma.article.create({
        data: {
          slug,
          title: body.title,
          summary: body.summary,
          content: body.content,
          category: body.category || "Postmortem",
          badge: body.badge || "Analysis",
          authorName: body.authorName || "DevOps.lab Editorial Team",
          authorRole: body.authorRole || "SRE Staff",
          authorAvatar: body.authorAvatar || null,
          readTime: body.readTime || "5 min read",
          tags: body.tags || ["devops", "incident"],
          featured: body.featured ?? false,
        },
      });

      return reply.code(201).send(created);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: "Failed to create article in database", code: "DB_ERROR" });
    }
  });

  // POST /articles/:id/like — toggle like — returns { likes: number, liked: boolean }
  fastify.post("/articles/:id/like", { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user?.id || request.user?.sub;
    if (!userId) {
      return reply.code(401).send({ error: "Must be signed in to like articles", code: "UNAUTHORIZED" });
    }

    try {
      const article = await request.prisma.article.findFirst({
        where: { OR: [{ id }, { slug: id }] },
      });
      if (!article) return reply.code(404).send({ error: "Article not found", code: "NOT_FOUND" });

      const existing = await request.prisma.articleLike.findUnique({
        where: { articleId_userId: { articleId: article.id, userId } },
      });

      let liked: boolean;
      if (existing) {
        await request.prisma.articleLike.delete({
          where: { articleId_userId: { articleId: article.id, userId } },
        });
        liked = false;
      } else {
        await request.prisma.articleLike.create({
          data: { articleId: article.id, userId },
        });
        liked = true;
      }

      const likes = await request.prisma.articleLike.count({ where: { articleId: article.id } });
      return reply.send({ likes, liked });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: "Failed to toggle like", code: "DB_ERROR" });
    }
  });

  // POST /articles/:id/bookmark — toggle save/bookmark — returns { saves: number, saved: boolean }
  fastify.post("/articles/:id/bookmark", { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user?.id || request.user?.sub;
    if (!userId) {
      return reply.code(401).send({ error: "Must be signed in to save articles", code: "UNAUTHORIZED" });
    }

    try {
      const article = await request.prisma.article.findFirst({
        where: { OR: [{ id }, { slug: id }] },
      });
      if (!article) return reply.code(404).send({ error: "Article not found", code: "NOT_FOUND" });

      const existing = await request.prisma.articleBookmark.findUnique({
        where: { articleId_userId: { articleId: article.id, userId } },
      });

      let saved: boolean;
      if (existing) {
        await request.prisma.articleBookmark.delete({
          where: { articleId_userId: { articleId: article.id, userId } },
        });
        saved = false;
      } else {
        await request.prisma.articleBookmark.create({
          data: { articleId: article.id, userId },
        });
        saved = true;
      }

      const saves = await request.prisma.articleBookmark.count({ where: { articleId: article.id } });
      return reply.send({ saves, saved });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: "Failed to toggle bookmark", code: "DB_ERROR" });
    }
  });

  // POST /articles/:id/report — submit a content report
  fastify.post("/articles/:id/report", { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { reason, details } = request.body as { reason: string; details?: string };
    const userId = request.user?.id || request.user?.sub;
    if (!userId) {
      return reply.code(401).send({ error: "Must be signed in to report articles", code: "UNAUTHORIZED" });
    }
    if (!reason) {
      return reply.code(400).send({ error: "reason is required", code: "VALIDATION_ERROR" });
    }

    try {
      const article = await request.prisma.article.findFirst({
        where: { OR: [{ id }, { slug: id }] },
      });
      if (!article) return reply.code(404).send({ error: "Article not found", code: "NOT_FOUND" });

      await request.prisma.articleReport.create({
        data: { articleId: article.id, userId, reason, details: details || null },
      });

      return reply.send({ success: true, message: "Report submitted. Our editorial team will review it." });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: "Failed to submit report", code: "DB_ERROR" });
    }
  });
}

