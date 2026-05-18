import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Type, type Static } from '@sinclair/typebox';
import { PrismaClient } from '@devops/db';
import argon2 from 'argon2';
import { UserRegisteredEvent, EmailVerificationRequestedEvent } from '@devops/messaging';

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
 * Core auth routes:
 *  GET  /health
 *  POST /register
 *  POST /login
 *  GET  /me
 *  POST /logout
 */
export const authRoutes = fp(async (fastify: FastifyInstance) => {
  // ── Health ─────────────────────────────────────────────────────────────────
  fastify.get('/health', async () => {
    return { status: 'ok', service: 'auth-service' };
  });

  // ── Register ───────────────────────────────────────────────────────────────
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
      const user = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          name: name ?? null,
          role: 'LEARNER',
        },
      });

      // Emit Kafka events — fire-and-forget, never block the response
      try {
        await fastify.messaging.emit(
          new UserRegisteredEvent({ userId: user.id, email: user.email, name: user.name })
        );
        await fastify.messaging.emit(
          new EmailVerificationRequestedEvent({
            userId: user.id,
            email: user.email,
            token: crypto.randomUUID(), // Owned by notification-service; token is disposable here
          })
        );
      } catch (err) {
        fastify.log.error(err, 'Failed to emit identity events');
      }

      const token = fastify.jwt.sign({ sub: user.id, email: user.email, role: user.role });

      return reply
        .setCookie('token', token, { httpOnly: true, path: '/', sameSite: 'lax', secure: process.env['NODE_ENV'] === 'production' })
        .send({ token, user: { id: user.id, email: user.email, role: user.role } });
    }
  );

  // ── Login ──────────────────────────────────────────────────────────────────
  fastify.post(
    '/login',
    { schema: { body: LoginSchema } },
    async (request: FastifyRequest<{ Body: Static<typeof LoginSchema> }>, reply: FastifyReply) => {
      const { email, password } = request.body;

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user?.password) {
        return reply.status(401).send({ error: 'Invalid credentials' });
      }

      const valid = await argon2.verify(user.password, password);
      if (!valid) {
        return reply.status(401).send({ error: 'Invalid credentials' });
      }

      const token = fastify.jwt.sign({ sub: user.id, email: user.email, role: user.role });

      return reply
        .setCookie('token', token, { httpOnly: true, path: '/', sameSite: 'lax', secure: process.env['NODE_ENV'] === 'production' })
        .send({ token, user: { id: user.id, email: user.email, role: user.role } });
    }
  );

  // ── Me ─────────────────────────────────────────────────────────────────────
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

  // ── Logout ─────────────────────────────────────────────────────────────────
  fastify.post('/logout', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.clearCookie('token', { path: '/' }).send({ success: true });
  });
});

export { prisma };
