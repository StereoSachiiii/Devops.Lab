import Fastify from 'fastify';
import cors from '@fastify/cors';
import path from 'path';
import dotenv from 'dotenv';
import { PrismaClient, Node, Edge } from '@devops/db';



dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

export const prisma = new PrismaClient();

/**
 * Types for Prisma relations
 */
type EdgeWithTo = Edge & { to: Node };
type EdgeWithFrom = Edge & { from: Node };
type CompletionWithNodeId = { nodeId: string };
type NodeWithOutgoing = Node & { outgoing: { toId: string }[] };

export function buildApp() {
  const fastify = Fastify({
    logger: process.env['NODE_ENV'] === 'test' ? false : true,
  });

  // Register CORS
  fastify.register(cors);

  // Register routes under both prefixes for compatibility with tests (root) and Kong gateway (/api/content)
  const registerRoutes = (prefix: string) => {
    fastify.get(`${prefix}/health`, async () => {
      return { status: 'ok', service: 'content-service' };
    });

    fastify.get(`${prefix}/nodes/:id`, async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const node = await prisma.node.findUnique({
          where: { id },
        });

        if (!node) {
          return reply.status(404).send({ error: 'Node not found' });
        }

        return node;
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({ error: 'Internal Server Error' });
      }
    });

    fastify.get(`${prefix}/nodes/:id/parents`, async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const edges = await prisma.edge.findMany({
          where: { fromId: id },
          include: { to: true },
        }) as EdgeWithTo[];
        
        return { nodes: edges.map((edge: EdgeWithTo) => edge.to) };
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({ error: 'Internal Server Error' });
      }
    });

    fastify.get(`${prefix}/nodes/:id/children`, async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const edges = await prisma.edge.findMany({
          where: { toId: id },
          include: { from: true },
        }) as EdgeWithFrom[];
        
        return { nodes: edges.map((edge: EdgeWithFrom) => edge.from) };
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({ error: 'Internal Server Error' });
      }
    });

    fastify.get(`${prefix}/nodes/:id/ancestors`, async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const ancestors = await prisma.$queryRaw<Node[]>`
          WITH RECURSIVE ancestors AS (
            SELECT "toId" FROM "Edge" WHERE "fromId" = ${id}
            UNION
            SELECT e."toId" FROM "Edge" e
            JOIN ancestors a ON e."fromId" = a."toId"
          )
          SELECT * FROM "Node" WHERE id IN (SELECT "toId" FROM ancestors)
        `;
        return { nodes: ancestors };
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({ error: 'Internal Server Error' });
      }
    });

    fastify.get(`${prefix}/users/:id/frontier`, async (request, reply) => {
      const { id: userId } = request.params as { id: string };
      try {
        const completions = await prisma.completion.findMany({
          where: { userId },
          select: { nodeId: true },
        }) as CompletionWithNodeId[];
        
        const completedNodeIds = completions.map((c: CompletionWithNodeId) => c.nodeId);

        const candidateNodes = await prisma.node.findMany({
          where: { id: { notIn: completedNodeIds } },
          include: {
            outgoing: { select: { toId: true } }
          }
        }) as NodeWithOutgoing[];

        const unlocked = candidateNodes.filter((node: NodeWithOutgoing) => 
          node.outgoing.every((edge: { toId: string }) => completedNodeIds.includes(edge.toId))
        );

        return { nodes: unlocked.map(({ outgoing: _, ...node }) => node) };
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({ error: 'Internal Server Error' });
      }
    });

    /**
     * GET /quizzes
     * Lists all quizzes in the DAG with correctIndex stripped from metadata.
     */
    fastify.get(`${prefix}/quizzes`, async (request, reply) => {
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

        return { quizzes: safeQuizzes };
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({ error: 'Internal Server Error' });
      }
    });

    /**
     * GET /quizzes/:id
     * Returns a specific quiz node with correctIndex stripped.
     */
    fastify.get(`${prefix}/quizzes/:id`, async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const quiz = await prisma.node.findFirst({
          where: { id, type: 'QUIZ' },
        });

        if (!quiz) {
          return reply.status(404).send({ error: 'Quiz not found' });
        }

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
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({ error: 'Internal Server Error' });
      }
    });

    /**
     * POST /quizzes/:id/submit
     * Submits selected options and validates them against the database.
     * If all are correct, registers a completion for the quiz node.
     */
    fastify.post(`${prefix}/quizzes/:id/submit`, async (request, reply) => {
      const { id } = request.params as { id: string };
      const { userId, answers } = request.body as { userId: string; answers: Record<string, number> };

      if (!userId || !answers) {
        return reply.status(400).send({ error: 'userId and answers are required' });
      }

      try {
        const quiz = await prisma.node.findFirst({
          where: { id, type: 'QUIZ' },
        });

        if (!quiz) {
          return reply.status(404).send({ error: 'Quiz not found' });
        }

        const meta = quiz.metadata as any;
        if (!meta || !Array.isArray(meta.questions)) {
          return reply.status(500).send({ error: 'Quiz metadata is malformed' });
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

        return {
          passed,
          score: correctCount,
          total: meta.questions.length,
          results,
        };
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({ error: 'Internal Server Error' });
      }
    });
  };

  registerRoutes('');
  registerRoutes('/api/content');

  return fastify;
}
