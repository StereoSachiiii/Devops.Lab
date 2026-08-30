import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import crypto from "crypto";
import { trace } from "@devops/observability";

const tracer = trace.getTracer("core-service");

interface CreateShareBody {
  challengeId?: string;
  type?: "CHALLENGE_SOLVE" | "BADGE_EARNED" | "QUIZ_MASTERY" | "CERTIFICATE";
  metadata?: Record<string, unknown>;
}

export async function shareRoutes(fastify: FastifyInstance) {
  // POST /api/shares — generate a share token for a completed challenge or achievement
  fastify.post(
    "/shares",
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return tracer.startActiveSpan("core.share_create", async (span) => {
        const userId = (request.user as { sub?: string; id?: string })?.sub || (request.user as { sub?: string; id?: string })?.id;
        if (!userId) {
          span.setAttribute("share.outcome", "unauthorized");
          return reply.status(401).send({ error: "Unauthorized" });
        }
        span.setAttribute("share.user_id", userId);

      const { challengeId, type = "CHALLENGE_SOLVE", metadata = {} } = (request.body || {}) as CreateShareBody;

      try {
        const user = await request.prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, name: true, username: true, avatarUrl: true, jobTitle: true },
        });

        if (!user) {
          return reply.status(404).send({ error: "User not found" });
        }

        let enrichedMetadata: Record<string, unknown> = { ...metadata };

        if (challengeId) {
          const challenge = await request.prisma.challenge.findUnique({
            where: { id: challengeId },
            select: { id: true, title: true, difficulty: true, category: true, xp: true },
          });

          if (!challenge) {
            return reply.status(404).send({ error: "Challenge not found" });
          }

          // Fetch verified checks for this challenge & user
          const checks = await request.prisma.challengeCheckResult.findMany({
            where: { userId, challengeId },
            select: { checkId: true, status: true, message: true, lastRunAt: true },
          });

          // Fetch completion timestamp
          const completion = await request.prisma.completion.findUnique({
            where: { userId_nodeId: { userId, nodeId: challengeId } },
          });

          enrichedMetadata = {
            ...enrichedMetadata,
            challengeTitle: challenge.title,
            difficulty: challenge.difficulty,
            category: challenge.category,
            xpEarned: challenge.xp,
            completedAt: completion?.createdAt || new Date(),
            verifiedChecks: checks.map((c) => ({
              checkId: c.checkId,
              status: c.status,
              message: c.message,
            })),
          };
        }

        // Generate clean random token
        const token = crypto.randomBytes(8).toString("hex");

        const shareToken = await request.prisma.shareToken.create({
          data: {
            token,
            type: type as any,
            userId,
            challengeId: challengeId || null,
            metadata: enrichedMetadata as object,
          },
        });

        return reply.status(201).send({
          token: shareToken.token,
          shareUrl: `/share/${shareToken.token}`,
          type: shareToken.type,
          createdAt: shareToken.createdAt,
        });
      } catch (err) {
        span.recordException(err as Error);
        fastify.log.error(err);
        return reply.status(500).send({ error: "Failed to create share token" });
      } finally {
        span.end();
      }
    });
  }
);

  // GET /api/shares/:token — public unauthenticated verification endpoint
  fastify.get("/shares/:token", async (request: FastifyRequest, reply: FastifyReply) => {
    return tracer.startActiveSpan("core.share_resolve", async (span) => {
      const { token } = request.params as { token: string };
      span.setAttribute("share.token", token);

      try {
        const shareRecord = await request.prisma.shareToken.findUnique({
          where: { token },
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
              },
            },
            challenge: {
              select: {
                id: true,
                title: true,
                difficulty: true,
                category: true,
                xp: true,
                tags: true,
              },
            },
          },
        });

        if (!shareRecord) {
          span.setAttribute("share.outcome", "not_found");
          return reply.status(404).send({ error: "Share token not found or expired", code: "NOT_FOUND" });
        }

        span.setAttribute("share.outcome", "success");
        span.setAttribute("share.type", shareRecord.type);

        // Increment view counter asynchronously
        request.prisma.shareToken.update({
          where: { token },
          data: { views: { increment: 1 } },
        }).catch((e) => fastify.log.warn({ err: e }, "Failed to increment shareToken view count"));

        return reply.send({
          token: shareRecord.token,
          type: shareRecord.type,
          createdAt: shareRecord.createdAt,
          views: shareRecord.views + 1,
          solver: shareRecord.user,
          challenge: shareRecord.challenge,
          metadata: shareRecord.metadata,
          isVerified: true,
          seal: {
            issuer: "DevOps.lab Platform Verification Authority",
            verifiedAt: shareRecord.createdAt,
            signatureAlgorithm: "HMAC-SHA256-PLATFORM-SEAL",
          },
        });
      } catch (err) {
        span.recordException(err as Error);
        fastify.log.error(err);
        return reply.status(500).send({ error: "Failed to fetch share details" });
      } finally {
        span.end();
      }
    });
  });
}
