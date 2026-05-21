import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Type, type Static } from '@sinclair/typebox';
import { PrismaClient } from '@devops/db';
import argon2 from 'argon2';
import crypto from 'crypto';

const prisma = new PrismaClient();

const RegisterSchema = Type.Object({
  email: Type.String({ format: 'email' }),
  password: Type.String({ minLength: 8 }),
  name: Type.Optional(Type.String()),
});

const LoginSchema = Type.Object({
  email: Type.String({ format: 'email' }),
  password: Type.String(),
});

/**
 * Core auth routes
 *  GET  /health
 *  GET  /public-key
 *  POST /register
 *  POST /login
 *  POST /refresh
 *  GET  /me
 *  POST /logout
 */
export const authRoutes = fp(async (fastify: FastifyInstance) => {
  fastify.get('/health', async () => {
    return { status: 'ok', service: 'auth-service' };
  });

  fastify.get('/public-key', async () => {
    return { publicKey: fastify.jwtPublicKey };
  });

  fastify.post(
    '/register',
    { schema: { body: RegisterSchema } },
    async (request: FastifyRequest<{ Body: Static<typeof RegisterSchema> }>, reply: FastifyReply) => {
      const { email, password, name } = request.body;

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        return reply.status(400).send({ error: 'User already exists' });
      }

      const hashedPassword = await argon2.hash(password);
      const verificationToken = crypto.randomUUID();

      const user = await prisma.$transaction(async (tx) => {
        const u = await tx.user.create({
          data: {
            email,
            password: hashedPassword,
            name: name ?? null,
            role: 'LEARNER',
          },
        });

        await tx.outboxEvent.create({
          data: {
            eventType: 'UserRegisteredEvent',
            payload: { userId: u.id, email: u.email, name: u.name },
          },
        });

        await tx.outboxEvent.create({
          data: {
            eventType: 'EmailVerificationRequestedEvent',
            payload: { userId: u.id, email: u.email, token: verificationToken },
          },
        });

        await tx.securityLog.create({
          data: {
            userId: u.id,
            action: 'REGISTER',
            ip: request.ip,
            userAgent: request.headers['user-agent'] ?? null,
          },
        });

        return u;
      });

      const token = fastify.jwt.sign({ sub: user.id, email: user.email, role: user.role, iss: 'devops-platform' });
      const refreshSecret = crypto.randomBytes(32).toString('hex');
      const refreshToken = `${user.id}.${refreshSecret}`;
      const tokenHash = crypto.createHash('sha256').update(refreshSecret).digest('hex');

      await fastify.redis.set(`auth:refresh:${user.id}:${tokenHash}`, '1', 'EX', 7 * 24 * 60 * 60);

      return reply
        .setCookie('token', token, { httpOnly: true, path: '/', sameSite: 'lax', secure: process.env['NODE_ENV'] === 'production' })
        .setCookie('refreshToken', refreshToken, { httpOnly: true, path: '/', sameSite: 'lax', secure: process.env['NODE_ENV'] === 'production' })
        .send({ token, user: { id: user.id, email: user.email, role: user.role } });
    }
  );

  fastify.post(
    '/login',
    { schema: { body: LoginSchema } },
    async (request: FastifyRequest<{ Body: Static<typeof LoginSchema> }>, reply: FastifyReply) => {
      const { email, password } = request.body;

      const lockoutKey = `auth:lockout:${email}`;
      const failsKey = `auth:fails:${email}`;

      const isLocked = await fastify.redis.get(lockoutKey);
      if (isLocked) {
        await prisma.securityLog.create({
          data: {
            action: 'LOCKOUT',
            ip: request.ip,
            userAgent: request.headers['user-agent'] ?? null,
            metadata: { email },
          },
        });
        return reply.status(429).send({ error: 'Account locked due to too many failed attempts. Try again later.' });
      }

      const user = await prisma.user.findUnique({ where: { email } });

      const handleFail = async () => {
        const fails = await fastify.redis.incr(failsKey);
        if (fails === 1) {
          await fastify.redis.expire(failsKey, 15 * 60);
        }
        if (fails >= 5) {
          await fastify.redis.set(lockoutKey, '1', 'EX', 15 * 60);
        }

        await prisma.securityLog.create({
          data: {
            userId: user?.id ?? null,
            action: 'LOGIN_FAILED',
            ip: request.ip,
            userAgent: request.headers['user-agent'] ?? null,
            metadata: { email },
          },
        });
      };

      if (!user?.password) {
        await handleFail();
        return reply.status(401).send({ error: 'Invalid credentials' });
      }

      const valid = await argon2.verify(user.password, password);
      if (!valid) {
        await handleFail();
        return reply.status(401).send({ error: 'Invalid credentials' });
      }

      await fastify.redis.del(failsKey);

      await prisma.securityLog.create({
        data: {
          userId: user.id,
          action: 'LOGIN_SUCCESS',
          ip: request.ip,
          userAgent: request.headers['user-agent'] ?? null,
        },
      });

      const token = fastify.jwt.sign({ sub: user.id, email: user.email, role: user.role, iss: 'devops-platform' });
      const refreshSecret = crypto.randomBytes(32).toString('hex');
      const refreshToken = `${user.id}.${refreshSecret}`;
      const tokenHash = crypto.createHash('sha256').update(refreshSecret).digest('hex');

      await fastify.redis.set(`auth:refresh:${user.id}:${tokenHash}`, '1', 'EX', 7 * 24 * 60 * 60);

      return reply
        .setCookie('token', token, { httpOnly: true, path: '/', sameSite: 'lax', secure: process.env['NODE_ENV'] === 'production' })
        .setCookie('refreshToken', refreshToken, { httpOnly: true, path: '/', sameSite: 'lax', secure: process.env['NODE_ENV'] === 'production' })
        .send({ token, user: { id: user.id, email: user.email, role: user.role } });
    }
  );

  fastify.post('/refresh', async (request: FastifyRequest, reply: FastifyReply) => {
    const refreshToken = request.cookies['refreshToken'];
    if (!refreshToken) {
      return reply.status(401).send({ error: 'Refresh token missing' });
    }

    const parts = refreshToken.split('.');
    if (parts.length !== 2) {
      return reply.status(401).send({ error: 'Invalid refresh token format' });
    }

    const [userId, tokenSecret] = parts as [string, string];
    const tokenHash = crypto.createHash('sha256').update(tokenSecret).digest('hex');
    const redisKey = `auth:refresh:${userId}:${tokenHash}`;

    const exists = await fastify.redis.get(redisKey);
    if (!exists) {
      // Replay attack / compromise detection: invalidate all active sessions for this user
      const keysPattern = `auth:refresh:${userId}:*`;
      const keys = await fastify.redis.keys(keysPattern);
      if (keys.length > 0) {
        await fastify.redis.del(...keys);
      }

      await prisma.securityLog.create({
        data: {
          userId,
          action: 'REVOCATION_BREACH',
          ip: request.ip,
          userAgent: request.headers['user-agent'] ?? null,
          metadata: { tokenHash },
        },
      });

      return reply.status(401).send({ error: 'Session expired or compromised. Please login again.' });
    }

    // Revoke the old refresh token
    await fastify.redis.del(redisKey);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return reply.status(401).send({ error: 'User not found' });
    }

    const newAccessToken = fastify.jwt.sign({ sub: user.id, email: user.email, role: user.role, iss: 'devops-platform' });
    const newSecret = crypto.randomBytes(32).toString('hex');
    const newRefreshToken = `${user.id}.${newSecret}`;
    const newHash = crypto.createHash('sha256').update(newSecret).digest('hex');

    await fastify.redis.set(`auth:refresh:${user.id}:${newHash}`, '1', 'EX', 7 * 24 * 60 * 60);

    return reply
      .setCookie('token', newAccessToken, { httpOnly: true, path: '/', sameSite: 'lax', secure: process.env['NODE_ENV'] === 'production' })
      .setCookie('refreshToken', newRefreshToken, { httpOnly: true, path: '/', sameSite: 'lax', secure: process.env['NODE_ENV'] === 'production' })
      .send({ token: newAccessToken, user: { id: user.id, email: user.email, role: user.role } });
  });

  fastify.get(
    '/me',
    { onRequest: [async (request) => { await request.jwtVerify(); }] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { sub } = request.user as { sub: string };

      const user = await prisma.user.findUnique({
        where: { id: sub },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          xp: true,
          emailVerified: true,
          createdAt: true,
        },
      });

      if (!user) {
        return reply.status(404).send({ error: 'User not found' });
      }

      return user;
    }
  );

  fastify.post('/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    const refreshToken = request.cookies['refreshToken'];
    if (refreshToken) {
      const parts = refreshToken.split('.');
      if (parts.length === 2) {
        const [userId, tokenSecret] = parts as [string, string];
        const tokenHash = crypto.createHash('sha256').update(tokenSecret).digest('hex');
        await fastify.redis.del(`auth:refresh:${userId}:${tokenHash}`);

        await prisma.securityLog.create({
          data: {
            userId,
            action: 'LOGOUT',
            ip: request.ip,
            userAgent: request.headers['user-agent'] ?? null,
          },
        });
      }
    }

    return reply
      .clearCookie('token', { path: '/' })
      .clearCookie('refreshToken', { path: '/' })
      .send({ success: true });
  });
});

export { prisma };
