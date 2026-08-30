import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

interface CreateCommentBody {
  content: string;
  parentId?: string;
}

interface VoteCommentBody {
  vote: number; // 1 or -1
}

export async function commentRoutes(fastify: FastifyInstance) {
  // GET /api/challenges/:id/comments — fetch 2-level threaded comments for challenge
  fastify.get("/challenges/:id/comments", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id: challengeId } = request.params as { id: string };

    let currentUserId: string | undefined;
    try {
      await request.jwtVerify();
      currentUserId = (request.user as { sub?: string; id?: string })?.sub || (request.user as { sub?: string; id?: string })?.id;
    } catch {}

    try {
      const topLevelComments = await request.prisma.challengeComment.findMany({
        where: { challengeId, parentId: null },
        include: {
          user: {
            select: { id: true, name: true, username: true, avatarUrl: true, jobTitle: true, role: true },
          },
          votes: true,
          replies: {
            include: {
              user: {
                select: { id: true, name: true, username: true, avatarUrl: true, jobTitle: true, role: true },
              },
              votes: true,
            },
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
      });

      const formatComment = (c: any) => {
        const upvotes = c.votes.filter((v: any) => v.vote > 0).length;
        const downvotes = c.votes.filter((v: any) => v.vote < 0).length;
        const score = upvotes - downvotes;
        const userVote = currentUserId ? c.votes.find((v: any) => v.userId === currentUserId)?.vote || 0 : 0;

        return {
          id: c.id,
          challengeId: c.challengeId,
          content: c.content,
          isPinned: c.isPinned,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
          author: c.user,
          score,
          userVote,
          replyCount: c.replies ? c.replies.length : 0,
        };
      };

      const results = topLevelComments.map((comment) => ({
        ...formatComment(comment),
        replies: (comment.replies || []).map(formatComment),
      }));

      return reply.send({ comments: results, total: results.length });
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: "Failed to fetch challenge comments" });
    }
  });

  // POST /api/challenges/:id/comments — create top-level comment or reply
  fastify.post(
    "/challenges/:id/comments",
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id: challengeId } = request.params as { id: string };
      const userId = (request.user as { sub?: string; id?: string })?.sub || (request.user as { sub?: string; id?: string })?.id;
      if (!userId) return reply.status(401).send({ error: "Unauthorized" });

      const { content, parentId } = (request.body || {}) as CreateCommentBody;
      if (!content || !content.trim()) {
        return reply.status(400).send({ error: "Comment content cannot be empty" });
      }

      try {
        const challenge = await request.prisma.challenge.findUnique({ where: { id: challengeId } });
        if (!challenge) return reply.status(404).send({ error: "Challenge not found" });

        if (parentId) {
          const parent = await request.prisma.challengeComment.findUnique({ where: { id: parentId } });
          if (!parent || parent.challengeId !== challengeId) {
            return reply.status(404).send({ error: "Parent comment not found" });
          }
        }

        const comment = await request.prisma.challengeComment.create({
          data: {
            challengeId,
            userId,
            parentId: parentId || null,
            content: content.trim(),
          },
          include: {
            user: {
              select: { id: true, name: true, username: true, avatarUrl: true, jobTitle: true, role: true },
            },
          },
        });

        return reply.status(201).send({
          id: comment.id,
          challengeId: comment.challengeId,
          content: comment.content,
          isPinned: comment.isPinned,
          createdAt: comment.createdAt,
          updatedAt: comment.updatedAt,
          author: comment.user,
          score: 0,
          userVote: 0,
          parentId: comment.parentId,
        });
      } catch (err) {
        fastify.log.error(err);
        return reply.status(500).send({ error: "Failed to post comment" });
      }
    }
  );

  // POST /api/comments/:id/vote — toggle upvote/downvote (+1, -1, 0 to cancel)
  fastify.post(
    "/comments/:id/vote",
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id: commentId } = request.params as { id: string };
      const userId = (request.user as { sub?: string; id?: string })?.sub || (request.user as { sub?: string; id?: string })?.id;
      if (!userId) return reply.status(401).send({ error: "Unauthorized" });

      const { vote } = (request.body || {}) as VoteCommentBody;

      try {
        const comment = await request.prisma.challengeComment.findUnique({ where: { id: commentId } });
        if (!comment) return reply.status(404).send({ error: "Comment not found" });

        const existing = await request.prisma.commentVote.findUnique({
          where: { commentId_userId: { commentId, userId } },
        });

        if (existing) {
          if (existing.vote === vote || vote === 0) {
            // Cancel vote
            await request.prisma.commentVote.delete({
              where: { commentId_userId: { commentId, userId } },
            });
          } else {
            // Change vote
            await request.prisma.commentVote.update({
              where: { commentId_userId: { commentId, userId } },
              data: { vote: vote > 0 ? 1 : -1 },
            });
          }
        } else if (vote !== 0) {
          // Insert new vote
          await request.prisma.commentVote.create({
            data: {
              commentId,
              userId,
              vote: vote > 0 ? 1 : -1,
            },
          });
        }

        const allVotes = await request.prisma.commentVote.findMany({ where: { commentId } });
        const upvotes = allVotes.filter((v) => v.vote > 0).length;
        const downvotes = allVotes.filter((v) => v.vote < 0).length;
        const score = upvotes - downvotes;
        const activeVote = allVotes.find((v) => v.userId === userId)?.vote || 0;

        return reply.send({ score, userVote: activeVote });
      } catch (err) {
        fastify.log.error(err);
        return reply.status(500).send({ error: "Failed to record vote" });
      }
    }
  );

  // DELETE /api/comments/:id — delete comment
  fastify.delete(
    "/comments/:id",
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const userId = (request.user as { sub?: string; id?: string })?.sub || (request.user as { sub?: string; id?: string })?.id;
      if (!userId) return reply.status(401).send({ error: "Unauthorized" });

      try {
        const comment = await request.prisma.challengeComment.findUnique({ where: { id } });
        if (!comment) return reply.status(404).send({ error: "Comment not found" });

        // Only author or admin can delete
        const user = await request.prisma.user.findUnique({ where: { id: userId } });
        if (comment.userId !== userId && user?.role !== "ADMIN") {
          return reply.status(403).send({ error: "Forbidden: Not permitted to delete this comment" });
        }

        await request.prisma.challengeComment.delete({ where: { id } });
        return reply.send({ success: true, message: "Comment deleted" });
      } catch (err) {
        fastify.log.error(err);
        return reply.status(500).send({ error: "Failed to delete comment" });
      }
    }
  );
}
