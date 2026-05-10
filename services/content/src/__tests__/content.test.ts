import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildApp } from '../app';

// Mock @devops/db
vi.mock('@devops/db', () => {

  const mockPrisma = {
    node: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    edge: {
      findMany: vi.fn(),
    },
    completion: {
      findMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
    $disconnect: vi.fn(),
  };
  return {
    PrismaClient: vi.fn(() => mockPrisma),
    NodeType: {
      CONCEPT: 'CONCEPT',
      SCENARIO: 'SCENARIO',
      QUIZ: 'QUIZ',
    },
  };
});

// Import prisma after mocking
import { prisma } from '../app';

describe('Content Service Integration', () => {
  const app = buildApp();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /health', () => {
    it('should return 200 and ok status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toEqual({
        status: 'ok',
        service: 'content-service',
      });
    });
  });

  describe('GET /nodes/:id', () => {
    it('should return a node if found', async () => {
      const mockNode = { id: 'test-node', title: 'Test Node' };
      (prisma.node.findUnique as any).mockResolvedValue(mockNode);

      const response = await app.inject({
        method: 'GET',
        url: '/nodes/test-node',
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toEqual(mockNode);
    });

    it('should return 404 if node not found', async () => {
      (prisma.node.findUnique as any).mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/nodes/missing',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('GET /nodes/:id/ancestors', () => {
    it('should call raw query for recursive traversal', async () => {
      const mockAncestors = [{ id: 'parent-1' }];
      (prisma.$queryRaw as any).mockResolvedValue(mockAncestors);

      const response = await app.inject({
        method: 'GET',
        url: '/nodes/child-1/ancestors',
      });

      expect(response.statusCode).toBe(200);
      expect(prisma.$queryRaw).toHaveBeenCalled();
      expect(JSON.parse(response.payload).nodes).toEqual(mockAncestors);
    });
  });

  describe('GET /users/:id/frontier', () => {
    it('should calculate unlocked nodes correctly', async () => {
      // Mock user has completed node A
      (prisma.completion.findMany as any).mockResolvedValue([{ nodeId: 'A' }]);
      
      // Mock node B exists, is not completed, and its prerequisite is node A
      (prisma.node.findMany as any).mockResolvedValue([
        {
          id: 'B',
          title: 'Node B',
          outgoing: [{ toId: 'A' }] // Prerequisite is A
        }
      ]);

      const response = await app.inject({
        method: 'GET',
        url: '/users/user-1/frontier',
      });

      expect(response.statusCode).toBe(200);
      const payload = JSON.parse(response.payload);
      expect(payload.nodes).toHaveLength(1);
      expect(payload.nodes[0]?.id).toBe('B');
    });
  });
});
