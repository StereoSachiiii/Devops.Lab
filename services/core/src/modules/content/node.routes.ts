import type { FastifyInstance } from 'fastify';
import { PrismaClient, Node, Edge } from '@devops/db';

/**
 * Types for Prisma relations used in DAG traversal queries.
 */
type EdgeWithTo = Edge & { to: Node };
type EdgeWithFrom = Edge & { from: Node };
type CompletionWithNodeId = { nodeId: string };
type NodeWithOutgoing = Node & { outgoing: { toId: string }[] };

export async function nodeRoutes(fastify: FastifyInstance) {
  const prisma = fastify.prisma as PrismaClient;

  fastify.get('/health', async () => {
    return { status: 'ok', service: 'core-service', module: 'content' };
  });

  /**
   * GET /nodes/:id — Fetch a single DAG node by ID.
   */
  fastify.get('/nodes/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const node = await prisma.node.findUnique({ where: { id } });
      if (!node) return reply.status(404).send({ error: 'Node not found', code: 'NOT_FOUND' });
      return node;
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });

  /**
   * GET /nodes/:id/parents — Direct parent nodes (one hop up).
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
   * GET /nodes/:id/children — Direct child nodes (one hop down).
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
   * GET /nodes/:id/ancestors — All ancestors via recursive CTE.
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
   * GET /users/:id/frontier — Compute the DAG frontier for a user.
   * Returns all incomplete nodes whose prerequisites are all completed.
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

      return { nodes: unlocked.map(({ outgoing: _, ...node }: any) => node) };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });
}
