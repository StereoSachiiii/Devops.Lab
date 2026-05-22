import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Type, type Static } from '@sinclair/typebox';
import { PrismaClient } from '@devops/db';
import argon2 from 'argon2';
import crypto from 'crypto';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';

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

const VerifyEmailSchema = Type.Object({
  token: Type.String(),
});

const ForgotPasswordSchema = Type.Object({
  email: Type.String({ format: 'email' }),
});

const ResetPasswordSchema = Type.Object({
  token: Type.String(),
  newPassword: Type.String({ minLength: 8 }),
});

const UpdateProfileSchema = Type.Object({
  name: Type.Optional(Type.String()),
});

const ChangePasswordSchema = Type.Object({
  currentPassword: Type.String(),
  newPassword: Type.String({ minLength: 8 }),
});

const MfaVerifySchema = Type.Object({
  code: Type.String(),
});

const MfaLoginSchema = Type.Object({
  mfaToken: Type.String(),
  code: Type.String(),
});


const config = {
  jwtIssuer: process.env['JWT_ISSUER'] || 'devops-platform',
  mfaAppName: process.env['MFA_APP_NAME'] || 'DevOps Platform',
  expiry: {
    emailVerification: parseInt(process.env['EXPIRY_EMAIL_VERIFICATION'] || '86400', 10),
    passwordReset: parseInt(process.env['EXPIRY_PASSWORD_RESET'] || '900', 10),
    refreshToken: parseInt(process.env['EXPIRY_REFRESH_TOKEN'] || '604800', 10),
    lockout: parseInt(process.env['EXPIRY_LOCKOUT'] || '900', 10),
    mfaToken: process.env['EXPIRY_MFA_TOKEN'] || '5m',
  },
  security: {
    maxFailedAttempts: parseInt(process.env['MAX_FAILED_ATTEMPTS'] || '5', 10),
  },
  defaults: {
    role: (process.env['DEFAULT_USER_ROLE'] || 'LEARNER') as any,
  }
};
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
            role: config.defaults.role,
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

      // Store verification token in Redis (24 hours)
      await fastify.redis.set(`auth:verify-email:${verificationToken}`, user.id, 'EX', config.expiry.emailVerification);

      const token = fastify.jwt.sign({ sub: user.id, email: user.email, role: user.role, iss: config.jwtIssuer });
      const refreshSecret = crypto.randomBytes(32).toString('hex');
      const refreshToken = `${user.id}.${refreshSecret}`;
      const tokenHash = crypto.createHash('sha256').update(refreshSecret).digest('hex');

      await fastify.redis.set(`auth:refresh:${user.id}:${tokenHash}`, '1', 'EX', config.expiry.refreshToken);

      return reply
        .setCookie('token', token, { httpOnly: true, path: '/', sameSite: 'lax', secure: process.env['NODE_ENV'] === 'production' })
        .setCookie('refreshToken', refreshToken, { httpOnly: true, path: '/', sameSite: 'lax', secure: process.env['NODE_ENV'] === 'production' })
        .send({ token, user: { id: user.id, email: user.email, role: user.role } });
    }
  );

  fastify.post('/verify-email', { schema: { body: VerifyEmailSchema } }, async (request, reply) => {
    const { token } = request.body as Static<typeof VerifyEmailSchema>;
    const userId = await fastify.redis.get(`auth:verify-email:${token}`);
    
    if (!userId) {
      return reply.status(400).send({ error: 'Invalid or expired verification token' });
    }

    await prisma.user.update({
      where: { id: userId },
      data: { emailVerified: new Date() },
    });

    await fastify.redis.del(`auth:verify-email:${token}`);
    return reply.send({ success: true });
  });

  fastify.post('/forgot-password', { schema: { body: ForgotPasswordSchema } }, async (request, reply) => {
    const { email } = request.body as Static<typeof ForgotPasswordSchema>;
    const user = await prisma.user.findUnique({ where: { email } });
    
    if (user) {
      const resetToken = crypto.randomBytes(32).toString('hex');
      await fastify.redis.set(`auth:reset-password:${resetToken}`, user.id, 'EX', config.expiry.passwordReset);
      
      await prisma.outboxEvent.create({
        data: {
          eventType: 'PasswordResetRequestedEvent',
          payload: { userId: user.id, email: user.email, token: resetToken },
        },
      });
    }

    return reply.send({ success: true, message: 'If the email exists, a password reset link has been sent.' });
  });

  fastify.post('/reset-password', { schema: { body: ResetPasswordSchema } }, async (request, reply) => {
    const { token, newPassword } = request.body as Static<typeof ResetPasswordSchema>;
    const userId = await fastify.redis.get(`auth:reset-password:${token}`);
    
    if (!userId) {
      return reply.status(400).send({ error: 'Invalid or expired reset token' });
    }

    const hashedPassword = await argon2.hash(newPassword);
    
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { password: hashedPassword },
      });
      await tx.securityLog.create({
        data: {
          userId,
          action: 'PASSWORD_RESET',
          ip: request.ip,
          userAgent: request.headers['user-agent'] ?? null,
        },
      });
    });

    await fastify.redis.del(`auth:reset-password:${token}`);

    // Invalidate all active sessions upon password reset
    const keys = await fastify.redis.keys(`auth:refresh:${userId}:*`);
    if (keys.length > 0) {
      await fastify.redis.del(...keys);
    }

    return reply.send({ success: true });
  });

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
          await fastify.redis.expire(failsKey, config.expiry.lockout);
        }
        if (fails >= config.security.maxFailedAttempts) {
          await fastify.redis.set(lockoutKey, '1', 'EX', config.expiry.passwordReset);
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

      // MFA Check
      if (user.mfaEnabled) {
        const mfaToken = fastify.jwt.sign({ sub: user.id, pendingMfa: true }, { expiresIn: config.expiry.mfaToken });
        return reply.send({ mfaRequired: true, mfaToken });
      }

      const token = fastify.jwt.sign({ sub: user.id, email: user.email, role: user.role, iss: config.jwtIssuer });
      const refreshSecret = crypto.randomBytes(32).toString('hex');
      const refreshToken = `${user.id}.${refreshSecret}`;
      const tokenHash = crypto.createHash('sha256').update(refreshSecret).digest('hex');

      await fastify.redis.set(`auth:refresh:${user.id}:${tokenHash}`, '1', 'EX', config.expiry.refreshToken);

      return reply
        .setCookie('token', token, { httpOnly: true, path: '/', sameSite: 'lax', secure: process.env['NODE_ENV'] === 'production' })
        .setCookie('refreshToken', refreshToken, { httpOnly: true, path: '/', sameSite: 'lax', secure: process.env['NODE_ENV'] === 'production' })
        .send({ token, user: { id: user.id, email: user.email, role: user.role } });
    }
  );

  fastify.post('/login/mfa', { schema: { body: MfaLoginSchema } }, async (request, reply) => {
    const { mfaToken, code } = request.body as Static<typeof MfaLoginSchema>;
    try {
      const decoded = fastify.jwt.verify<{ sub: string, pendingMfa: boolean }>(mfaToken);
      if (!decoded.pendingMfa) {
        return reply.status(401).send({ error: 'Invalid MFA token payload' });
      }
      
      const user = await prisma.user.findUnique({ where: { id: decoded.sub } });
      if (!user || !user.mfaSecret) {
        return reply.status(401).send({ error: 'MFA setup incomplete' });
      }

      const isValid = authenticator.verify({ token: code, secret: user.mfaSecret });
      if (!isValid) {
        return reply.status(401).send({ error: 'Invalid MFA code' });
      }

      const token = fastify.jwt.sign({ sub: user.id, email: user.email, role: user.role, iss: config.jwtIssuer });
      const refreshSecret = crypto.randomBytes(32).toString('hex');
      const refreshToken = `${user.id}.${refreshSecret}`;
      const tokenHash = crypto.createHash('sha256').update(refreshSecret).digest('hex');

      await fastify.redis.set(`auth:refresh:${user.id}:${tokenHash}`, '1', 'EX', config.expiry.refreshToken);

      return reply
        .setCookie('token', token, { httpOnly: true, path: '/', sameSite: 'lax', secure: process.env['NODE_ENV'] === 'production' })
        .setCookie('refreshToken', refreshToken, { httpOnly: true, path: '/', sameSite: 'lax', secure: process.env['NODE_ENV'] === 'production' })
        .send({ token, user: { id: user.id, email: user.email, role: user.role } });

    } catch {
      return reply.status(401).send({ error: 'Invalid or expired MFA token' });
    }
  });
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

    const newAccessToken = fastify.jwt.sign({ sub: user.id, email: user.email, role: user.role, iss: config.jwtIssuer });
    const newSecret = crypto.randomBytes(32).toString('hex');
    const newRefreshToken = `${user.id}.${newSecret}`;
    const newHash = crypto.createHash('sha256').update(newSecret).digest('hex');

    await fastify.redis.set(`auth:refresh:${user.id}:${newHash}`, '1', 'EX', config.expiry.refreshToken);

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
          mfaEnabled: true,
        },
      });

      if (!user) {
        return reply.status(404).send({ error: 'User not found' });
      }

      return user;
    }
  );

  fastify.put(
    '/me',
    { schema: { body: UpdateProfileSchema }, onRequest: [async (r) => await r.jwtVerify()] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { sub } = request.user as { sub: string };
      const { name } = request.body as Static<typeof UpdateProfileSchema>;
      
      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      
      const user = await prisma.user.update({
        where: { id: sub },
        data: updateData,
        select: { id: true, name: true, email: true }
      });
      
      return reply.send({ success: true, user });
    }
  );

  fastify.post(
    '/change-password',
    { schema: { body: ChangePasswordSchema }, onRequest: [async (r) => await r.jwtVerify()] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { sub } = request.user as { sub: string };
      const { currentPassword, newPassword } = request.body as Static<typeof ChangePasswordSchema>;
      
      const user = await prisma.user.findUnique({ where: { id: sub } });
      if (!user) return reply.status(404).send({ error: 'User not found' });
      if (!user.password) return reply.status(400).send({ error: 'User uses OAuth and has no password' });
      
      const valid = await argon2.verify(user.password, currentPassword);
      if (!valid) return reply.status(401).send({ error: 'Incorrect current password' });

      const hashedPassword = await argon2.hash(newPassword);
      await prisma.user.update({ where: { id: sub }, data: { password: hashedPassword } });
      
      return reply.send({ success: true });
    }
  );

  fastify.delete(
    '/me',
    { onRequest: [async (r) => await r.jwtVerify()] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { sub } = request.user as { sub: string };
      
      await prisma.$transaction(async (tx) => {
        await tx.outboxEvent.create({
          data: { eventType: 'UserDeletedEvent', payload: { userId: sub } }
        });
        
        await tx.securityLog.deleteMany({ where: { userId: sub } });
        await tx.submission.deleteMany({ where: { userId: sub } });
        await tx.completion.deleteMany({ where: { userId: sub } });
        await tx.labSession.deleteMany({ where: { userId: sub } });
        
        await tx.user.delete({ where: { id: sub } });
      });

      const keys = await fastify.redis.keys(`auth:refresh:${sub}:*`);
      if (keys.length > 0) await fastify.redis.del(...keys);

      return reply
        .clearCookie('token', { path: '/' })
        .clearCookie('refreshToken', { path: '/' })
        .send({ success: true });
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

  fastify.post(
    '/logout-all',
    { onRequest: [async (r) => await r.jwtVerify()] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { sub } = request.user as { sub: string };
      const keys = await fastify.redis.keys(`auth:refresh:${sub}:*`);
      if (keys.length > 0) await fastify.redis.del(...keys);

      await prisma.securityLog.create({
        data: {
          userId: sub,
          action: 'LOGOUT_ALL',
          ip: request.ip,
          userAgent: request.headers['user-agent'] ?? null,
        },
      });

      return reply
        .clearCookie('token', { path: '/' })
        .clearCookie('refreshToken', { path: '/' })
        .send({ success: true });
    }
  );

  // MFA
  fastify.post(
    '/mfa/setup',
    { onRequest: [async (r) => await r.jwtVerify()] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { sub, email } = request.user as { sub: string, email: string };
      const user = await prisma.user.findUnique({ where: { id: sub } });
      
      if (user?.mfaEnabled) return reply.status(400).send({ error: 'MFA is already enabled' });

      const secret = authenticator.generateSecret();
      await prisma.user.update({ where: { id: sub }, data: { mfaSecret: secret } });

      const otpauth = authenticator.keyuri(email, config.mfaAppName, secret);
      const qrCodeUrl = await QRCode.toDataURL(otpauth);
      
      return reply.send({ secret, qrCodeUrl });
    }
  );

  fastify.post(
    '/mfa/verify',
    { schema: { body: MfaVerifySchema }, onRequest: [async (r) => await r.jwtVerify()] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { sub } = request.user as { sub: string };
      const { code } = request.body as Static<typeof MfaVerifySchema>;
      
      const user = await prisma.user.findUnique({ where: { id: sub } });
      if (!user || !user.mfaSecret) return reply.status(400).send({ error: 'MFA setup not initialized' });
      if (user.mfaEnabled) return reply.status(400).send({ error: 'MFA is already enabled' });

      const isValid = authenticator.verify({ token: code, secret: user.mfaSecret });
      if (!isValid) return reply.status(401).send({ error: 'Invalid MFA code' });

      await prisma.user.update({ where: { id: sub }, data: { mfaEnabled: true } });
      return reply.send({ success: true });
    }
  );

});

export { prisma };
