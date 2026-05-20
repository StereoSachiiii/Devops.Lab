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
 * Core auth routes
 *  GET  /health
 *  POST /register
 *  POST /login
 *  GET  /me
 *  POST /logout
 */
export const authRoutes = fp(async (fastify: FastifyInstance) => {
  fastify.get('/health', async () => {
    return { status: 'ok', service: 'auth-service' };
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
      const user = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          name: name ?? null,
          role: 'LEARNER',
        },
      });

      try {
        await fastify.messaging.emit(
          new UserRegisteredEvent({ userId: user.id, email: user.email, name: user.name })
        );
        await fastify.messaging.emit(
          new EmailVerificationRequestedEvent({
            userId: user.id,
            email: user.email,
            token: crypto.randomUUID(),
          })
        );
      } catch (err) {
        fastify.log.error(err, 'Failed to emit identity events');
      }

      const token = fastify.jwt.sign({ sub: user.id, email: user.email, role: user.role, iss: 'devops-platform' });

      return reply
        .setCookie('token', token, { httpOnly: true, path: '/', sameSite: 'lax', secure: process.env['NODE_ENV'] === 'production' })
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

      const token = fastify.jwt.sign({ sub: user.id, email: user.email, role: user.role, iss: 'devops-platform' });

      return reply
        .setCookie('token', token, { httpOnly: true, path: '/', sameSite: 'lax', secure: process.env['NODE_ENV'] === 'production' })
        .send({ token, user: { id: user.id, email: user.email, role: user.role } });
    }
  );

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

  fastify.post('/logout', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.clearCookie('token', { path: '/' }).send({ success: true });
  });
});

export { prisma };
