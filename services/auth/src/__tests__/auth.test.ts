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
vi.mock('@fastify/redis', () => {
  const plugin = async function mockRedisPlugin(fastify: any) {
    if (!fastify.hasDecorator('redis')) {
      fastify.decorate('redis', {
        get: vi.fn(),
        set: vi.fn(),
        incr: vi.fn(),
        expire: vi.fn(),
        del: vi.fn(),
        keys: vi.fn().mockResolvedValue([]),
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
  const mockPrisma: any = {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
    },
    securityLog: {
      create: vi.fn(),
    },
    outboxEvent: {
      create: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
    },
    $transaction: vi.fn((fn: (tx: any) => any) => fn(mockPrisma)),
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

  // ── Public Key ──────────────────────────────────────────────────────────────
  describe('GET /public-key', () => {
    it('returns the public verification key', async () => {
      const response = await app.inject({ method: 'GET', url: '/public-key' });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload) as { publicKey: string };
      expect(body.publicKey).toBeDefined();
      expect(body.publicKey).toContain('PUBLIC KEY');
    });
  });

  // ── Register ────────────────────────────────────────────────────────────────
  describe('POST /register', () => {
    it('registers a new user using transaction outbox and returns tokens', async () => {
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

      // Check transaction and outbox creation
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.outboxEvent.create).toHaveBeenCalledTimes(2);
      expect(prisma.securityLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'REGISTER',
            userId: 'user-1',
          }),
        })
      );
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
  });

  // ── Login ───────────────────────────────────────────────────────────────────
  describe('POST /login', () => {
    it('authenticates, logs success, and stores refresh token in Redis', async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        role: 'LEARNER',
        password: '$argon2id$hashed',
      });

      const response = await app.inject({
        method: 'POST',
        url: '/login',
        payload: { email: 'test@example.com', password: 'password123' },
      });

      expect(response.statusCode).toBe(200);
      expect(prisma.securityLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'LOGIN_SUCCESS',
            userId: 'user-1',
          }),
        })
      );
      expect(app.redis.set).toHaveBeenCalled();
    });

    it('returns 401 for wrong password and logs failure', async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        role: 'LEARNER',
        password: '$argon2id$hashed',
      });

      const argon2 = await import('argon2');
      vi.mocked(argon2.default.verify).mockResolvedValueOnce(false);

      const response = await app.inject({
        method: 'POST',
        url: '/login',
        payload: { email: 'test@example.com', password: 'wrongpassword' },
      });

      expect(response.statusCode).toBe(401);
      expect(prisma.securityLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'LOGIN_FAILED',
            userId: 'user-1',
          }),
        })
      );
    });
  });

  // ── Refresh ─────────────────────────────────────────────────────────────────
  describe('POST /refresh', () => {
    it('rotates refresh token and returns new access token when valid', async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        role: 'LEARNER',
      });

      vi.mocked(app.redis.get).mockResolvedValueOnce('1');

      const response = await app.inject({
        method: 'POST',
        url: '/refresh',
        cookies: { refreshToken: 'user-1.oldsecret' },
      });

      expect(response.statusCode).toBe(200);
      const payload = JSON.parse(response.payload) as { token: string };
      expect(payload.token).toBeDefined();
      expect(app.redis.del).toHaveBeenCalled();
      expect(app.redis.set).toHaveBeenCalled();
    });

    it('returns 401 if refresh token is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/refresh',
      });
      expect(response.statusCode).toBe(401);
    });

    it('invalidates all active user sessions and logs breach if token not found (compromise check)', async () => {
      vi.mocked(app.redis.get).mockResolvedValueOnce(null);
      vi.mocked(app.redis.keys).mockResolvedValueOnce(['auth:refresh:user-1:key1', 'auth:refresh:user-1:key2']);

      const response = await app.inject({
        method: 'POST',
        url: '/refresh',
        cookies: { refreshToken: 'user-1.stolen' },
      });

      expect(response.statusCode).toBe(401);
      expect(app.redis.del).toHaveBeenCalledWith('auth:refresh:user-1:key1', 'auth:refresh:user-1:key2');
      expect(prisma.securityLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'REVOCATION_BREACH',
            userId: 'user-1',
          }),
        })
      );
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
        emailVerified: null,
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
  });

  // ── Logout ──────────────────────────────────────────────────────────────────
  describe('POST /logout', () => {
    it('revokes refresh token and clears cookies', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/logout',
        cookies: { refreshToken: 'user-1.secret' },
      });
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toEqual({ success: true });
      expect(app.redis.del).toHaveBeenCalled();
      expect(prisma.securityLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'LOGOUT',
            userId: 'user-1',
          }),
        })
      );
    });
  });
});
