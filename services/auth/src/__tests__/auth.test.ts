import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildApp } from '../app';

// Mock @devops/db
vi.mock('@devops/db', () => {
  const mockPrisma = {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
    },
  };
  return {
    PrismaClient: vi.fn(() => mockPrisma),
  };
});

import { prisma } from '../app';

describe('Auth Service', () => {
  const app = buildApp();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return health status', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.payload)).toEqual({ status: 'ok', service: 'auth-service' });
  });

  describe('POST /register', () => {
    it('should register a new user', async () => {
      (prisma.user.findUnique as any).mockResolvedValue(null);
      (prisma.user.create as any).mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        role: 'LEARNER',
      });

      const response = await app.inject({
        method: 'POST',
        url: '/register',
        payload: {
          email: 'test@example.com',
          password: 'password123',
          name: 'Test User',
        },
      });

      expect(response.statusCode).toBe(200);
      const payload = JSON.parse(response.payload);
      expect(payload.user.email).toBe('test@example.com');
      expect(payload.token).toBeDefined();
    });

    it('should fail if user already exists', async () => {
      (prisma.user.findUnique as any).mockResolvedValue({ id: 'existing' });

      const response = await app.inject({
        method: 'POST',
        url: '/register',
        payload: {
          email: 'test@example.com',
          password: 'password123',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });
});
