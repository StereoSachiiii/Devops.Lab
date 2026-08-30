import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { trace } from "@devops/observability";

const tracer = trace.getTracer("core-service");


export async function quizRoutes(fastify: FastifyInstance) {

  // Strip correctIndex from responses — never expose answers to clients
  const stripAnswers = (quiz: import("@devops/db").Node) => {
    const meta = quiz.metadata as Record<string, unknown> | null;
    if (meta && Array.isArray(meta["questions"])) {
      return {
        ...quiz,
        metadata: {
          ...meta,
          questions: meta["questions"].map(({ correctIndex: _correctIndex, ...q }: { correctIndex: number, [key: string]: unknown }) => q),
        },
      };
    }
    return quiz;
  };

  fastify.get("/quizzes", async (request, reply) => {
    try {
      const quizzes = await request.prisma.node.findMany({
        where: { type: "QUIZ" },
      });
      return reply.send(quizzes.map(stripAnswers));
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: "Internal Server Error" });
    }
  });

  // GET /quizzes/history — fetch recent quiz attempts across all quizzes for learner dashboard
  fastify.get(
    "/quizzes/history",
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = (request.user as { sub?: string; id?: string })?.sub || (request.user as { sub?: string; id?: string })?.id;
      if (!userId) return reply.status(401).send({ error: "Unauthorized" });

      try {
        const attempts = await request.prisma.quizAttempt.findMany({
          where: { userId },
          include: {
            node: { select: { id: true, title: true, metadata: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 20,
        });

        return reply.send({
          attempts: attempts.map((a) => ({
            id: a.id,
            quizId: a.nodeId,
            quizTitle: a.node.title,
            score: a.score,
            total: a.total,
            passed: a.passed,
            createdAt: a.createdAt,
          })),
        });
      } catch (err) {
        fastify.log.error(err);
        return reply.status(500).send({ error: "Failed to fetch learner quiz history" });
      }
    }
  );

  fastify.get("/quizzes/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const quiz = await request.prisma.node.findFirst({
        where: { id, type: "QUIZ" },
      });
      if (!quiz) return reply.status(404).send({ error: "Quiz not found", code: "NOT_FOUND" });
      return reply.send(stripAnswers(quiz));
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: "Internal Server Error" });
    }
  });

  // Correct answers unlock DAG progression
  fastify.post("/quizzes/:id/submit", async (request, reply) => {
    return tracer.startActiveSpan("core.quiz_submit", async (span) => {
      const { id } = request.params as { id: string };
      const body = (request.body || {}) as { userId?: string; answers?: Record<string, number> };

      span.setAttribute("quiz.id", id);

      let tokenUserId: string | undefined;
      try {
        await request.jwtVerify();
        tokenUserId =
          (request.user as { sub?: string; id?: string })?.sub ||
          (request.user as { sub?: string; id?: string })?.id;
      } catch {}

      const effectiveUserId = tokenUserId || body.userId;
      const answers = body.answers;

      if (!effectiveUserId || !answers) {
        span.setAttribute("quiz.outcome", "missing_fields");
        return reply
          .status(400)
          .send({ error: "userId (or authenticated session) and answers are required", code: "MISSING_FIELDS" });
      }

      const userId = effectiveUserId;
      span.setAttribute("quiz.user_id", userId);

      try {
        const quiz = await request.prisma.node.findFirst({
          where: { OR: [{ id }, { metadata: { path: ["slug"], equals: id } }], type: "QUIZ" },
        });

        if (!quiz) {
          span.setAttribute("quiz.outcome", "not_found");
          return reply.status(404).send({ error: "Quiz not found", code: "NOT_FOUND" });
        }

        const meta = quiz.metadata as Record<string, unknown> | null;
        if (!meta || !Array.isArray(meta["questions"])) {
          span.setAttribute("quiz.outcome", "malformed_quiz");
          return reply
            .status(500)
            .send({ error: "Quiz metadata is malformed", code: "MALFORMED_QUIZ" });
        }

        let correctCount = 0;
        const results = meta["questions"].map(
          (q: { id: string; correctIndex: number; explanation?: string }) => {
            const userSelection = answers[q.id];
            const isCorrect = userSelection === q.correctIndex;
            if (isCorrect) correctCount++;

            return {
              questionId: q.id,
              correct: isCorrect,
              correctIndex: q.correctIndex,
              explanation: q.explanation,
            };
          }
        );

        const total = (meta["questions"] as any[]).length;
        const passed = total > 0 && correctCount / total >= 0.7;

        span.setAttribute("quiz.score", correctCount);
        span.setAttribute("quiz.total", total);
        span.setAttribute("quiz.passed", passed);

        // Record attempt in QuizAttempt table
        try {
          await request.prisma.quizAttempt.create({
            data: {
              userId,
              nodeId: quiz.id,
              score: correctCount,
              total,
              passed,
              answers: {
                userAnswers: answers,
                results,
              },
            },
          });
        } catch (attErr) {
          fastify.log.warn({ err: attErr }, "Failed to record quiz attempt snapshot");
        }

        if (passed) {
          await request.prisma.completion.upsert({
            where: {
              userId_nodeId: {
                userId,
                nodeId: quiz.id,
              },
            },
            update: {},
            create: {
              userId,
              nodeId: quiz.id,
            },
          });
        }

        return reply.send({
          passed,
          score: correctCount,
          total,
          results,
        });
      } catch (error) {
        span.recordException(error as Error);
        fastify.log.error(error);
        return reply.status(500).send({ error: "Internal Server Error" });
      } finally {
        span.end();
      }
    });
  });

  // GET /quizzes/:id/history — fetch user's attempts for a specific quiz over time
  fastify.get(
    "/quizzes/:id/history",
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const userId = (request.user as { sub?: string; id?: string })?.sub || (request.user as { sub?: string; id?: string })?.id;
      if (!userId) return reply.status(401).send({ error: "Unauthorized" });

      try {
        const quiz = await request.prisma.node.findFirst({
          where: { OR: [{ id }, { metadata: { path: ["slug"], equals: id } }], type: "QUIZ" },
        });

        if (!quiz) return reply.status(404).send({ error: "Quiz not found" });

        const attempts = await request.prisma.quizAttempt.findMany({
          where: { userId, nodeId: quiz.id },
          orderBy: { createdAt: "desc" },
        });

        return reply.send({
          quizId: quiz.id,
          quizTitle: quiz.title,
          attempts: attempts.map((a) => ({
            id: a.id,
            score: a.score,
            total: a.total,
            passed: a.passed,
            createdAt: a.createdAt,
            answers: a.answers,
          })),
        });
      } catch (err) {
        fastify.log.error(err);
        return reply.status(500).send({ error: "Failed to fetch quiz history" });
      }
    }
  );

  // GET /quizzes/:id/editorial — provides in-depth editorial, takeaway summary, and deep dive
  fastify.get("/quizzes/:id/editorial", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const quiz = await request.prisma.node.findFirst({
        where: { OR: [{ id }, { metadata: { path: ["slug"], equals: id } }], type: "QUIZ" },
      });

      if (!quiz) {
        return reply.status(404).send({ error: "Quiz not found", code: "NOT_FOUND" });
      }

      const meta = (quiz.metadata as Record<string, unknown> | null) || {};
      const questions = (meta["questions"] as any[]) || [];

      const editorialContent =
        meta["editorial"] ||
        `# Editorial & Deep Dive: ${quiz.title}

## Conceptual Overview
This assessment tests core proficiency in **${quiz.title}**. Mastery of these concepts is critical for production reliability, container orchestration, and rapid incident triage.

## Question-by-Question Deep Dive
${questions
  .map(
    (q, i) => `### Question ${i + 1}: ${q.question || q.text}
- **Correct Concept**: ${q.explanation || "Understanding the architectural lifecycle and command behavior is essential."}
- **Production Takeaway**: Avoid manual workarounds; rely on deterministic, automated infrastructure patterns.`
  )
  .join("\n\n")}

## Recommended Next Steps
1. Practice live debugging in our interactive hands-on sandboxes.
2. Review our SRE incident postmortems in the Articles library.`;

      return reply.send({
        id: quiz.id,
        title: quiz.title,
        editorial: editorialContent,
        takeaways: meta["takeaways"] || [
          "Understand the difference between graceful shutdown (SIGTERM) and forced termination (SIGKILL).",
          "Ensure non-root container user permissions comply with least-privilege security.",
          "Verify listening ports and sockets before deploying configuration modifications.",
        ],
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: "Internal Server Error" });
    }
  });
}
