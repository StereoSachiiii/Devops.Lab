import type { FastifyInstance } from 'fastify';
import { PrismaClient } from '@devops/db';

export async function quizRoutes(fastify: FastifyInstance) {
  const prisma = fastify.prisma as PrismaClient;

  /**
   * GET /quizzes — List all quizzes with correctIndex stripped from metadata.
   */
  fastify.get('/quizzes', async (_request, reply) => {
    try {
      const quizzes = await prisma.node.findMany({
        where: { type: 'QUIZ' },
      });

      const safeQuizzes = quizzes.map((quiz) => {
        const meta = quiz.metadata as any;
        if (meta && Array.isArray(meta.questions)) {
          const strippedQuestions = meta.questions.map(({ correctIndex, ...q }: any) => q);
          return {
            ...quiz,
            metadata: {
              ...meta,
              questions: strippedQuestions,
            },
          };
        }
        return quiz;
      });

      return reply.send({ quizzes: safeQuizzes });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });

  /**
   * GET /quizzes/:id — Get a specific quiz node with correctIndex stripped.
   */
  fastify.get('/quizzes/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const quiz = await prisma.node.findFirst({
        where: { id, type: 'QUIZ' },
      });

      if (!quiz) return reply.status(404).send({ error: 'Quiz not found', code: 'NOT_FOUND' });

      const meta = quiz.metadata as any;
      if (meta && Array.isArray(meta.questions)) {
        const strippedQuestions = meta.questions.map(({ correctIndex, ...q }: any) => q);
        return reply.send({
          ...quiz,
          metadata: {
            ...meta,
            questions: strippedQuestions,
          },
        });
      }

      return reply.send(quiz);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });

  /**
   * POST /quizzes/:id/submit — Submit quiz answers and validate against DB.
   * If all answers are correct, registers a completion to advance the DAG frontier.
   */
  fastify.post('/quizzes/:id/submit', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { userId, answers } = request.body as { userId: string; answers: Record<string, number> };

    if (!userId || !answers) {
      return reply.status(400).send({ error: 'userId and answers are required', code: 'MISSING_FIELDS' });
    }

    try {
      const quiz = await prisma.node.findFirst({
        where: { id, type: 'QUIZ' },
      });

      if (!quiz) return reply.status(404).send({ error: 'Quiz not found', code: 'NOT_FOUND' });

      const meta = quiz.metadata as any;
      if (!meta || !Array.isArray(meta.questions)) {
        return reply.status(500).send({ error: 'Quiz metadata is malformed', code: 'MALFORMED_QUIZ' });
      }

      let correctCount = 0;
      const results = meta.questions.map((q: any) => {
        const userSelection = answers[q.id];
        const isCorrect = userSelection === q.correctIndex;
        if (isCorrect) correctCount++;

        return {
          questionId: q.id,
          correct: isCorrect,
          correctIndex: q.correctIndex,
          explanation: q.explanation,
        };
      });

      const passed = correctCount === meta.questions.length;

      // If passed, upsert completion to advance DAG frontier
      if (passed) {
        await prisma.completion.upsert({
          where: {
            userId_nodeId: {
              userId,
              nodeId: id,
            },
          },
          update: {},
          create: {
            userId,
            nodeId: id,
          },
        });
      }

      return reply.send({
        passed,
        score: correctCount,
        total: meta.questions.length,
        results,
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });
}
