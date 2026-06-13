import type { FastifyInstance } from 'fastify';
import { PrismaClient } from '@devops/db';

export async function quizRoutes(fastify: FastifyInstance) {
  const prisma = fastify.prisma as PrismaClient;

  // Strip correctIndex from responses — never expose answers to clients
  const stripAnswers = (quiz: any) => {
    const meta = quiz.metadata as any;
    if (meta && Array.isArray(meta.questions)) {
      return {
        ...quiz,
        metadata: {
          ...meta,
          questions: meta.questions.map(({ correctIndex, ...q }: any) => q),
        },
      };
    }
    return quiz;
  };

  fastify.get('/quizzes', async (_request, reply) => {
    try {
      const quizzes = await prisma.node.findMany({
        where: { type: 'QUIZ' },
      });
      return reply.send({ quizzes: quizzes.map(stripAnswers) });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });

  fastify.get('/quizzes/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const quiz = await prisma.node.findFirst({
        where: { id, type: 'QUIZ' },
      });
      if (!quiz) return reply.status(404).send({ error: 'Quiz not found', code: 'NOT_FOUND' });
      return reply.send(stripAnswers(quiz));
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });

  // Correct answers unlock DAG progression
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
