import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../app';

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
      update: vi.fn(),
      delete: vi.fn(),
      upsert: vi.fn(),
    },
    securityLog: {
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    submission: {
      deleteMany: vi.fn(),
    },
    completion: {
      deleteMany: vi.fn(),
    },
    labSession: {
      deleteMany: vi.fn(),
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

    it('registers successfully even if message broker fails to emit events', async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (prisma.user.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'user-2',
        email: 'test2@example.com',
        name: 'Test User 2',
        role: 'LEARNER',
      });

      // Mock messaging emit to reject
      vi.spyOn(app.messaging, 'emit').mockRejectedValue(new Error('Broker offline'));

      const response = await app.inject({
        method: 'POST',
        url: '/register',
        payload: { email: 'test2@example.com', password: 'password123', name: 'Test User 2' },
      });

      expect(response.statusCode).toBe(200);
      const payload = JSON.parse(response.payload) as { token: string; user: { email: string } };
      expect(payload.user.email).toBe('test2@example.com');
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

    it('returns 429 if the account is locked out', async () => {
      vi.spyOn(app.redis, 'get').mockResolvedValueOnce('1');

      const response = await app.inject({
        method: 'POST',
        url: '/login',
        payload: { email: 'test@example.com', password: 'password123' },
      });

      expect(response.statusCode).toBe(429);
      expect(JSON.parse(response.payload)).toEqual({
        error: 'Account locked due to too many failed attempts. Try again later.',
      });
    });

    it('locks the account after 5 failed attempts', async () => {
      vi.spyOn(app.redis, 'get').mockResolvedValueOnce(null);
      vi.spyOn(app.redis, 'incr').mockResolvedValueOnce(5);
      const setSpy = vi.spyOn(app.redis, 'set');

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
      expect(setSpy).toHaveBeenCalledWith('auth:lockout:test@example.com', '1', 'EX', 900);
    });

    it('resets failed attempts on successful login', async () => {
      vi.spyOn(app.redis, 'get').mockResolvedValueOnce(null);
      const delSpy = vi.spyOn(app.redis, 'del');

      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        role: 'LEARNER',
        password: '$argon2id$hashed',
      });

      const argon2 = await import('argon2');
      vi.mocked(argon2.default.verify).mockResolvedValueOnce(true);

      const response = await app.inject({
        method: 'POST',
        url: '/login',
        payload: { email: 'test@example.com', password: 'password123' },
      });

      expect(response.statusCode).toBe(200);
      expect(delSpy).toHaveBeenCalledWith('auth:fails:test@example.com');
    });

    it('returns 401 and increments fails for users without a password (OAuth)', async () => {
      vi.spyOn(app.redis, 'get').mockResolvedValueOnce(null);
      const incrSpy = vi.spyOn(app.redis, 'incr').mockResolvedValueOnce(1);

      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'user-oauth',
        email: 'oauth@example.com',
        role: 'LEARNER',
        password: null,
      });

      const response = await app.inject({
        method: 'POST',
        url: '/login',
        payload: { email: 'oauth@example.com', password: 'somepassword' },
      });

      expect(response.statusCode).toBe(401);
      expect(incrSpy).toHaveBeenCalledWith('auth:fails:oauth@example.com');
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
  // ── Email Verification ──────────────────────────────────────────────────────
  describe('POST /verify-email', () => {
    it('verifies email with valid token', async () => {
      vi.mocked(app.redis.get).mockResolvedValueOnce('user-1');
      (prisma.user.update as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'user-1' });

      const response = await app.inject({
        method: 'POST',
        url: '/verify-email',
        payload: { token: 'valid-token' }
      });

      expect(response.statusCode).toBe(200);
      expect(prisma.user.update).toHaveBeenCalled();
      expect(app.redis.del).toHaveBeenCalled();
    });
  });

  // ── Password Reset ──────────────────────────────────────────────────────────
  describe('Password Reset Flow', () => {
    it('POST /forgot-password creates event and redis token', async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'user-1', email: 'test@example.com' });

      const response = await app.inject({
        method: 'POST',
        url: '/forgot-password',
        payload: { email: 'test@example.com' }
      });

      expect(response.statusCode).toBe(200);
      expect(app.redis.set).toHaveBeenCalled();
      expect(prisma.outboxEvent.create).toHaveBeenCalled();
    });

    it('POST /reset-password updates password and clears sessions', async () => {
      vi.mocked(app.redis.get).mockResolvedValueOnce('user-1');
      vi.mocked(app.redis.keys).mockResolvedValueOnce(['auth:refresh:user-1:key1']);

      const response = await app.inject({
        method: 'POST',
        url: '/reset-password',
        payload: { token: 'valid-token', newPassword: 'newpassword123' }
      });

      expect(response.statusCode).toBe(200);
      expect(app.redis.del).toHaveBeenCalled();
    });
  });

  // ── Account Management ──────────────────────────────────────────────────────
  describe('Account Management', () => {
    it('PUT /me updates profile', async () => {
      const token = app.jwt.sign({ sub: 'user-1', email: 'test@example.com', role: 'LEARNER' });
      (prisma.user.update as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'user-1', name: 'New Name' });

      const response = await app.inject({
        method: 'PUT',
        url: '/me',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'New Name' }
      });

      expect(response.statusCode).toBe(200);
    });

    it('POST /change-password updates password', async () => {
      const token = app.jwt.sign({ sub: 'user-1', email: 'test@example.com', role: 'LEARNER' });
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'user-1', password: '$argon2id$hashed' });

      const response = await app.inject({
        method: 'POST',
        url: '/change-password',
        headers: { authorization: `Bearer ${token}` },
        payload: { currentPassword: 'password123', newPassword: 'newpassword123' }
      });

      expect(response.statusCode).toBe(200);
    });

    it('DELETE /me deletes user', async () => {
      const token = app.jwt.sign({ sub: 'user-1', email: 'test@example.com', role: 'LEARNER' });
      vi.mocked(app.redis.keys).mockResolvedValueOnce(['auth:refresh:user-1:key1']);

      const response = await app.inject({
        method: 'DELETE',
        url: '/me',
        headers: { authorization: `Bearer ${token}` }
      });

      expect(response.statusCode).toBe(200);
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(app.redis.del).toHaveBeenCalled();
    });
  });

  // ── Logout All ──────────────────────────────────────────────────────────────
  describe('POST /logout-all', () => {
    it('revokes all refresh tokens', async () => {
      const token = app.jwt.sign({ sub: 'user-1', email: 'test@example.com', role: 'LEARNER' });
      vi.mocked(app.redis.keys).mockResolvedValueOnce(['auth:refresh:user-1:key1', 'auth:refresh:user-1:key2']);

      const response = await app.inject({
        method: 'POST',
        url: '/logout-all',
        headers: { authorization: `Bearer ${token}` }
      });

      expect(response.statusCode).toBe(200);
      expect(app.redis.del).toHaveBeenCalled();
      expect(prisma.securityLog.create).toHaveBeenCalled();
    });
  });

  // ── MFA ─────────────────────────────────────────────────────────────────────
  describe('MFA', () => {
    it('POST /mfa/setup returns secret and QR code', async () => {
      const token = app.jwt.sign({ sub: 'user-1', email: 'test@example.com', role: 'LEARNER' });
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'user-1', mfaEnabled: false });

      const response = await app.inject({
        method: 'POST',
        url: '/mfa/setup',
        headers: { authorization: `Bearer ${token}` }
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload).secret).toBeDefined();
    });

    it('POST /mfa/verify enables MFA', async () => {
      const token = app.jwt.sign({ sub: 'user-1', email: 'test@example.com', role: 'LEARNER' });
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'user-1', mfaEnabled: false, mfaSecret: 'TESTSECRET' });

      // Mock otplib verify
      const { authenticator } = await import('otplib');
      vi.spyOn(authenticator, 'verify').mockReturnValueOnce(true);

      const response = await app.inject({
        method: 'POST',
        url: '/mfa/verify',
        headers: { authorization: `Bearer ${token}` },
        payload: { code: '123456' }
      });

      expect(response.statusCode).toBe(200);
      expect(prisma.user.update).toHaveBeenCalled();
    });
  });
});
