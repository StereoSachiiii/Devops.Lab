import Fastify from 'fastify';
import cors from '@fastify/cors';
import dotenv from 'dotenv';
import { PrismaClient, Node, Edge } from '@devops/db';



dotenv.config();

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

  /**
   * Health Check
   */
  fastify.get('/health', async () => {
    return { status: 'ok', service: 'content-service' };
  });

  /**
   * GET /nodes/:id
   * Returns the node itself.
   */
  fastify.get('/nodes/:id', async (request, reply) => {
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

  /**
   * GET /nodes/:id/parents
   * Returns immediate prerequisites.
   */
  fastify.get('/nodes/:id/parents', async (request, reply) => {
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

  /**
   * GET /nodes/:id/children
   * Returns what this node directly unlocks.
   */
  fastify.get('/nodes/:id/children', async (request, reply) => {
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

  /**
   * GET /nodes/:id/ancestors
   * Full prerequisite chain via recursive traversal.
   */
  fastify.get('/nodes/:id/ancestors', async (request, reply) => {
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

  /**
   * GET /users/:id/frontier
   * Returns nodes that are currently unlocked for the user.
   */
  fastify.get('/users/:id/frontier', async (request, reply) => {
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

  return fastify;
}
