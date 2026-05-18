import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../app.js';

// ── Mock argon2 ─────────────────────────────────────────────────────────────
vi.mock('argon2', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('$argon2id$hashed'),
    verify: vi.fn().mockResolvedValue(true), // default: password matches
  },
}));

// ── Mock @fastify/redis ─────────────────────────────────────────────────────
// ── Mock @fastify/redis ─────────────────────────────────────────────────────
vi.mock('@fastify/redis', () => {
  const plugin = async function mockRedisPlugin(fastify: any) {
    if (!fastify.hasDecorator('redis')) {
      fastify.decorate('redis', {
        get: vi.fn(),
        set: vi.fn(),
        incr: vi.fn(),
        expire: vi.fn(),
        del: vi.fn(),
      });
    }
  };
  (plugin as any)[Symbol.for('skip-override')] = true;

  return {
    default: plugin
  };
});

// ── Mock @devops/db ─────────────────────────────────────────────────────────
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

// ── Mock @devops/messaging ──────────────────────────────────────────────────
vi.mock('@devops/messaging', () => ({
  MessagingService: vi.fn().mockImplementation(() => ({
    initProducer: vi.fn().mockResolvedValue(undefined),
    emit: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
  })),
  UserRegisteredEvent: vi.fn().mockImplementation((payload: unknown) => ({ topic: 'identity.user.registered', payload })),
  EmailVerificationRequestedEvent: vi.fn().mockImplementation((payload: unknown) => ({ topic: 'identity.email.verify', payload })),
}));

// Import prisma AFTER mocks are registered
import { PrismaClient } from '@devops/db';
const prisma = new PrismaClient();

describe('Auth Service', () => {
  const app = buildApp();

  // Must await ready() so plugins (JWT, cookie, oauth) are initialized
  beforeAll(async () => {
    await app.ready();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  // ── Health ──────────────────────────────────────────────────────────────────
  it('GET /health — returns ok', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.payload)).toEqual({ status: 'ok', service: 'auth-service' });
  });

  // ── Register ────────────────────────────────────────────────────────────────
  describe('POST /register', () => {
    it('registers a new user and returns token + httpOnly cookie', async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (prisma.user.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        role: 'LEARNER',
      });

      const response = await app.inject({
        method: 'POST',
        url: '/register',
        payload: { email: 'test@example.com', password: 'password123', name: 'Test User' },
      });

      expect(response.statusCode).toBe(200);
      const payload = JSON.parse(response.payload) as { token: string; user: { email: string } };
      expect(payload.user.email).toBe('test@example.com');
      expect(payload.token).toBeDefined();
      expect(response.headers['set-cookie']).toBeDefined();
    });

    it('returns 400 if user already exists', async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'existing' });

      const response = await app.inject({
        method: 'POST',
        url: '/register',
        payload: { email: 'test@example.com', password: 'password123' },
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.payload)).toMatchObject({ error: 'User already exists' });
    });

    it('returns 400 if password is too short', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/register',
        payload: { email: 'test@example.com', password: 'short' },
      });
      expect(response.statusCode).toBe(400);
    });
  });

  // ── Login ───────────────────────────────────────────────────────────────────
  describe('POST /login', () => {
    it('returns 401 for unknown email', async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const response = await app.inject({
        method: 'POST',
        url: '/login',
        payload: { email: 'nobody@example.com', password: 'password123' },
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 401 for wrong password', async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        role: 'LEARNER',
        password: '$argon2id$hashed',
      });

      // Override the default mock: password does NOT match
      const argon2 = await import('argon2');
      vi.mocked(argon2.default.verify).mockResolvedValueOnce(false);

      const response = await app.inject({
        method: 'POST',
        url: '/login',
        payload: { email: 'test@example.com', password: 'wrongpassword' },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ── Me ──────────────────────────────────────────────────────────────────────
  describe('GET /me', () => {
    it('returns user profile when authenticated', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        role: 'LEARNER',
        xp: 0,
        emailVerified: null,   // required by schema — was missing before
        createdAt: new Date(),
      };
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);

      const token = app.jwt.sign({ sub: 'user-1', email: 'test@example.com', role: 'LEARNER' });

      const response = await app.inject({
        method: 'GET',
        url: '/me',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      const payload = JSON.parse(response.payload) as { id: string; email: string };
      expect(payload.id).toBe('user-1');
      expect(payload.email).toBe('test@example.com');
    });

    it('returns 401 when no token is provided', async () => {
      const response = await app.inject({ method: 'GET', url: '/me' });
      expect(response.statusCode).toBe(401);
    });

    it('returns 404 if user is not found in DB', async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const token = app.jwt.sign({ sub: 'ghost-user', email: 'ghost@example.com', role: 'LEARNER' });

      const response = await app.inject({
        method: 'GET',
        url: '/me',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // ── Logout ──────────────────────────────────────────────────────────────────
  describe('POST /logout', () => {
    it('returns success and clears cookie', async () => {
      const response = await app.inject({ method: 'POST', url: '/logout' });
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toEqual({ success: true });
      // Cookie should be cleared (set-cookie header present)
      expect(response.headers['set-cookie']).toBeDefined();
    });
  });
});
