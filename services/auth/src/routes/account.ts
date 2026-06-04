import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Type, type Static } from '@sinclair/typebox';
import argon2 from 'argon2';
import crypto from 'crypto';
import { trace } from '@devops/observability';
import { prisma } from '../utils/db';
import {
  config,
  errorReply,
  createSession,
  clearSessionCookies,
  invalidateAllSessions,
  parseRefreshToken,
  logSecurityEvent,
} from '../utils/session';

const tracer = trace.getTracer('auth-service');

// ─── Schemas ──────────────────────────────────────────────────────────────────

const RegisterSchema = Type.Object({
  email:    Type.String({ format: 'email' }),
  password: Type.String({ minLength: 8 }),
  name:     Type.Optional(Type.String()),
});

const LoginSchema = Type.Object({
  email:    Type.String({ format: 'email' }),
  password: Type.String(),
});

const VerifyEmailSchema = Type.Object({
  token: Type.String(),
});

const ForgotPasswordSchema = Type.Object({
  email: Type.String({ format: 'email' }),
});

const ResetPasswordSchema = Type.Object({
  token:       Type.String(),
  newPassword: Type.String({ minLength: 8 }),
});

const UpdateProfileSchema = Type.Object({
  name: Type.Optional(Type.String()),
});

const ChangePasswordSchema = Type.Object({
  currentPassword: Type.String(),
  newPassword:     Type.String({ minLength: 8 }),
});

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Increment failed-login counter; lock the account when the limit is hit. */
async function handleLoginFail(
  fastify: FastifyInstance,
  request: FastifyRequest,
  email: string,
  userId?: string,
): Promise<void> {
  const failsKey    = `auth:fails:${email}`;
  const lockoutKey  = `auth:lockout:${email}`;

  const fails = await fastify.redis.incr(failsKey);
  if (fails === 1) {
    await fastify.redis.expire(failsKey, config.expiry.lockout);
  }
  if (fails >= config.security.maxFailedAttempts) {
    await fastify.redis.set(lockoutKey, '1', 'EX', config.expiry.passwordReset);
  }

  await logSecurityEvent(prisma, request, {
    userId:   userId ?? null,
    action:   'LOGIN_FAILED',
    metadata: { email },
  });
}

// ─── Route registration ───────────────────────────────────────────────────────

export async function accountRoutes(fastify: FastifyInstance): Promise<void> {

  // ── Public key (for other services to verify JWTs) ──────────────────────────

  fastify.get('/public-key', async () => ({
    publicKey: fastify.jwtPublicKey,
  }));

  // ── Register ────────────────────────────────────────────────────────────────

  fastify.post(
    '/register',
    { schema: { body: RegisterSchema } },
    async (req: FastifyRequest<{ Body: Static<typeof RegisterSchema> }>, reply) => {
      return tracer.startActiveSpan('auth.register', async (span) => {
        try {
          const { email, password, name } = req.body;
          span.setAttribute('auth.email', email);

          if (await prisma.user.findUnique({ where: { email } })) {
            span.setAttribute('auth.outcome', 'user_exists');
            fastify.log.info({ email }, 'Register failed: user exists');
            fastify.metrics.registerCounter.inc({ outcome: 'user_exists' });
            return errorReply(reply, 400, 'USER_EXISTS', 'User already exists');
          }

          const hashedPassword     = await argon2.hash(password);
          const verificationToken  = crypto.randomUUID();

          // Create user + outbox events + audit log in a single transaction.
          const user = await prisma.$transaction(async (tx) => {
            const u = await tx.user.create({
              data: { email, password: hashedPassword, name: name ?? null, role: config.defaults.role },
            });

            await tx.outboxEvent.create({
              data: {
                eventType: 'UserRegisteredEvent',
                payload:   { userId: u.id, email: u.email, name: u.name },
              },
            });

            await tx.outboxEvent.create({
              data: {
                eventType: 'EmailVerificationRequestedEvent',
                payload:   { userId: u.id, email: u.email, token: verificationToken },
              },
            });

            await tx.securityLog.create({
              data: { userId: u.id, action: 'REGISTER', ip: req.ip, userAgent: req.headers['user-agent'] ?? null },
            });

            return u;
          });

          // Store verification token in Redis (24 h default).
          await fastify.redis.set(
            `auth:verify-email:${verificationToken}`, user.id, 'EX', config.expiry.emailVerification,
          );

          span.setAttribute('auth.outcome', 'success');
          span.setAttribute('auth.user_id', user.id);
          fastify.metrics.registerCounter.inc({ outcome: 'success' });
          return await createSession(fastify, reply, user);
        } catch (err) {
          span.setAttribute('auth.outcome', 'error');
          span.recordException(err as Error);
          fastify.metrics.registerCounter.inc({ outcome: 'error' });
          throw err;
        } finally {
          span.end();
        }
      });
    },
  );

  // ── Login ───────────────────────────────────────────────────────────────────

  fastify.post(
    '/login',
    { schema: { body: LoginSchema } },
    async (req: FastifyRequest<{ Body: Static<typeof LoginSchema> }>, reply) => {
      return tracer.startActiveSpan('auth.login', async (span) => {
        const loginTimer = fastify.metrics.loginDuration.startTimer();
        try {
          const { email, password } = req.body;
          span.setAttribute('auth.email', email);

          const lockoutKey = `auth:lockout:${email}`;

          // 1. Check lockout.
          if (await fastify.redis.get(lockoutKey)) {
            await logSecurityEvent(prisma, req, { action: 'LOCKOUT', metadata: { email } });
            fastify.log.warn({ email }, 'Login attempt while account locked');
            span.setAttribute('auth.outcome', 'account_locked');
            fastify.metrics.loginCounter.inc({ outcome: 'account_locked' });
            loginTimer();
            return errorReply(reply, 429, 'ACCOUNT_LOCKED',
              'Account locked due to too many failed attempts. Try again later.');
          }

          // 2. Look up user.
          const user = await prisma.user.findUnique({ where: { email } });

          if (!user?.password) {
            await handleLoginFail(fastify, req, email, user?.id);
            fastify.log.warn({ email }, 'Login failed: user has no password (OAuth)');
            span.setAttribute('auth.outcome', 'invalid_credentials');
            fastify.metrics.loginCounter.inc({ outcome: 'invalid_credentials' });
            loginTimer();
            return errorReply(reply, 401, 'INVALID_CREDENTIALS', 'Invalid credentials');
          }

          // 3. Verify password.
          if (!(await argon2.verify(user.password, password))) {
            await handleLoginFail(fastify, req, email, user.id);
            fastify.log.warn({ email, userId: user.id }, 'Login failed: invalid password');
            span.setAttribute('auth.outcome', 'invalid_credentials');
            fastify.metrics.loginCounter.inc({ outcome: 'invalid_credentials' });
            loginTimer();
            return errorReply(reply, 401, 'INVALID_CREDENTIALS', 'Invalid credentials');
          }

          // 4. Clear fail counter.
          await fastify.redis.del(`auth:fails:${email}`);

          await logSecurityEvent(prisma, req, { userId: user.id, action: 'LOGIN_SUCCESS' });

          // 5. MFA gate — return a short-lived pending token instead of a session.
          if (user.mfaEnabled) {
            const mfaToken = fastify.jwt.sign(
              { sub: user.id, pendingMfa: true },
              { expiresIn: config.expiry.mfaToken },
            );
            span.setAttribute('auth.outcome', 'mfa_required');
            span.setAttribute('auth.user_id', user.id);
            fastify.metrics.loginCounter.inc({ outcome: 'mfa_required' });
            loginTimer();
            return reply.send({ mfaRequired: true, mfaToken });
          }

          // 6. Create session.
          span.setAttribute('auth.outcome', 'success');
          span.setAttribute('auth.user_id', user.id);
          fastify.metrics.loginCounter.inc({ outcome: 'success' });
          loginTimer();
          return await createSession(fastify, reply, user);
        } catch (err) {
          span.setAttribute('auth.outcome', 'error');
          span.recordException(err as Error);
          fastify.metrics.loginCounter.inc({ outcome: 'error' });
          loginTimer();
          throw err;
        } finally {
          span.end();
        }
      });
    },
  );

  // ── Verify email ────────────────────────────────────────────────────────────

  fastify.post(
    '/verify-email',
    { schema: { body: VerifyEmailSchema } },
    async (req, reply) => {
      const { token } = req.body as Static<typeof VerifyEmailSchema>;
      const userId    = await fastify.redis.get(`auth:verify-email:${token}`);

      if (!userId) {
        fastify.log.info({ token }, 'Email verification failed: invalid or expired token');
        return errorReply(reply, 400, 'INVALID_VERIFICATION_TOKEN', 'Invalid or expired verification token');
      }

      await prisma.user.update({ where: { id: userId }, data: { emailVerified: new Date() } });
      await fastify.redis.del(`auth:verify-email:${token}`);

      return reply.send({ success: true });
    },
  );

  // ── Forgot password ─────────────────────────────────────────────────────────

  fastify.post(
    '/forgot-password',
    { schema: { body: ForgotPasswordSchema } },
    async (req, reply) => {
      const { email } = req.body as Static<typeof ForgotPasswordSchema>;
      const user = await prisma.user.findUnique({ where: { email } });

      if (user) {
        const resetToken = crypto.randomBytes(32).toString('hex');

        await fastify.redis.set(`auth:reset-password:${resetToken}`, user.id, 'EX', config.expiry.passwordReset);
        await prisma.outboxEvent.create({
          data: {
            eventType: 'PasswordResetRequestedEvent',
            payload:   { userId: user.id, email: user.email, token: resetToken },
          },
        });
      }

      // Always return success to prevent email enumeration.
      return reply.send({ success: true, message: 'If the email exists, a password reset link has been sent.' });
    },
  );

  // ── Reset password ──────────────────────────────────────────────────────────

  fastify.post(
    '/reset-password',
    { schema: { body: ResetPasswordSchema } },
    async (req, reply) => {
      const { token, newPassword } = req.body as Static<typeof ResetPasswordSchema>;
      const userId = await fastify.redis.get(`auth:reset-password:${token}`);

      if (!userId) {
        return errorReply(reply, 400, 'INVALID_RESET_TOKEN', 'Invalid or expired reset token');
      }

      const hashedPassword = await argon2.hash(newPassword);

      await prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id: userId }, data: { password: hashedPassword } });
        await tx.securityLog.create({
          data: { userId, action: 'PASSWORD_RESET', ip: req.ip, userAgent: req.headers['user-agent'] ?? null },
        });
      });

      await fastify.redis.del(`auth:reset-password:${token}`);
      await invalidateAllSessions(fastify, userId);

      return reply.send({ success: true });
    },
  );

  // ── Refresh token rotation ──────────────────────────────────────────────────

  fastify.post('/refresh', async (req, reply) => {
    const parsed = parseRefreshToken(req.cookies['refreshToken']);

    if (!parsed) {
      return errorReply(reply, 401, 'REFRESH_TOKEN_MISSING', 'Refresh token missing or malformed');
    }

    const { userId, redisKey } = parsed;

    // Validate against Redis.
    const exists = await fastify.redis.get(redisKey);

    if (!exists) {
      // Possible replay attack — nuke every session for this user.
      await invalidateAllSessions(fastify, userId);
      fastify.log.warn({ userId }, 'Refresh breach detected — invalidating all sessions');

      await logSecurityEvent(prisma, req, {
        userId,
        action:   'REVOCATION_BREACH',
        metadata: { tokenHash: redisKey.split(':').pop() },
      });

      return errorReply(reply, 401, 'SESSION_COMPROMISED', 'Session expired or compromised. Please login again.');
    }

    // Rotate: revoke old, issue new.
    await fastify.redis.del(redisKey);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return errorReply(reply, 401, 'USER_NOT_FOUND', 'User not found');
    }

    return createSession(fastify, reply, user);
  });

  // ── Get profile ─────────────────────────────────────────────────────────────

  fastify.get(
    '/me',
    {
      onRequest: [
        async (request, _reply) => {
          try {
            await request.jwtVerify();
          } catch (err) {
            request.log.info(
              { err, url: request.url, hasAuthHeader: Boolean(request.headers['authorization']) },
              'JWT verification failed for /me',
            );
            throw err;
          }
        },
      ],
    },
    async (req, reply) => {
      const { sub } = req.user;

      const user = await prisma.user.findUnique({
        where:  { id: sub },
        select: { id: true, email: true, name: true, role: true, xp: true, emailVerified: true, createdAt: true, mfaEnabled: true },
      });

      if (!user) {
        req.log.info({ userId: sub }, 'User not found for /me');
        return errorReply(reply, 404, 'USER_NOT_FOUND', 'User not found');
      }

      return user;
    },
  );

  // ── Update profile ──────────────────────────────────────────────────────────

  fastify.put(
    '/me',
    { schema: { body: UpdateProfileSchema }, onRequest: [async (r) => r.jwtVerify()] },
    async (req, reply) => {
      const { sub }  = req.user;
      const { name } = req.body as Static<typeof UpdateProfileSchema>;

      const updateData: Record<string, string> = {};
      if (name !== undefined) updateData['name'] = name;

      const user = await prisma.user.update({
        where:  { id: sub },
        data:   updateData,
        select: { id: true, name: true, email: true },
      });

      return reply.send({ success: true, user });
    },
  );

  // ── Change password ─────────────────────────────────────────────────────────

  fastify.post(
    '/change-password',
    { schema: { body: ChangePasswordSchema }, onRequest: [async (r) => r.jwtVerify()] },
    async (req, reply) => {
      const { sub } = req.user;
      const { currentPassword, newPassword } = req.body as Static<typeof ChangePasswordSchema>;

      const user = await prisma.user.findUnique({ where: { id: sub } });
      if (!user)             return errorReply(reply, 404, 'USER_NOT_FOUND',     'User not found');
      if (!user.password)    return errorReply(reply, 400, 'OAUTH_NO_PASSWORD',   'User uses OAuth and has no password');

      if (!(await argon2.verify(user.password, currentPassword))) {
        return errorReply(reply, 401, 'INCORRECT_PASSWORD', 'Incorrect current password');
      }

      await prisma.user.update({ where: { id: sub }, data: { password: await argon2.hash(newPassword) } });
      return reply.send({ success: true });
    },
  );

  // ── Delete account ──────────────────────────────────────────────────────────

  fastify.delete(
    '/me',
    { onRequest: [async (r) => r.jwtVerify()] },
    async (req, reply) => {
      const { sub } = req.user;

      await prisma.$transaction(async (tx) => {
        await tx.outboxEvent.create({ data: { eventType: 'UserDeletedEvent', payload: { userId: sub } } });
        await tx.securityLog.deleteMany({ where: { userId: sub } });
        await tx.submission.deleteMany({ where: { userId: sub } });
        await tx.completion.deleteMany({ where: { userId: sub } });
        await tx.labSession.deleteMany({ where: { userId: sub } });
        await tx.user.delete({ where: { id: sub } });
      });

      await invalidateAllSessions(fastify, sub);

      return clearSessionCookies(reply).send({ success: true });
    },
  );

  // ── Logout (single session) ─────────────────────────────────────────────────

  fastify.post('/logout', async (req, reply) => {
    const parsed = parseRefreshToken(req.cookies['refreshToken']);

    if (parsed) {
      await fastify.redis.del(parsed.redisKey);
      await logSecurityEvent(prisma, req, { userId: parsed.userId, action: 'LOGOUT' });
    }

    return clearSessionCookies(reply).send({ success: true });
  });

  // ── Logout (all sessions) ───────────────────────────────────────────────────

  fastify.post(
    '/logout-all',
    { onRequest: [async (r) => r.jwtVerify()] },
    async (req, reply) => {
      const { sub } = req.user;

      await invalidateAllSessions(fastify, sub);
      await logSecurityEvent(prisma, req, { userId: sub, action: 'LOGOUT_ALL' });

      return clearSessionCookies(reply).send({ success: true });
    },
  );
}
