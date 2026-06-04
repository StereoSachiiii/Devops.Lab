import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@devops/db';
import crypto from 'crypto';

declare module 'fastify' {
  interface FastifyInstance {
    jwtPublicKey: string;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: {
      sub: string;
      id: string;
      email: string;
      role: string;
      iss?: string;
      pendingMfa?: boolean;
    };
  }
}


const int = (key: string, fallback: number): number =>
  parseInt(process.env[key] || String(fallback), 10);

export const config = {
  jwtIssuer:   process.env['JWT_ISSUER']   || 'devops-platform',
  mfaAppName:  process.env['MFA_APP_NAME'] || 'DevOps Platform',
  frontendUrl: process.env['FRONTEND_URL'] || 'http://localhost:3000',
  isProd:      process.env['NODE_ENV'] === 'production',
  expiry: {
    emailVerification: int('EXPIRY_EMAIL_VERIFICATION', 86_400),   // 24 h
    passwordReset:     int('EXPIRY_PASSWORD_RESET',     900),       // 15 min
    refreshToken:      int('EXPIRY_REFRESH_TOKEN',      604_800),   // 7 days
    lockout:           int('EXPIRY_LOCKOUT',            900),       // 15 min
    mfaToken:          process.env['EXPIRY_MFA_TOKEN'] || '5m',
  },
  security: {
    maxFailedAttempts: int('MAX_FAILED_ATTEMPTS', 5),
  },
  defaults: {
    role: (process.env['DEFAULT_USER_ROLE'] || 'LEARNER') as 'LEARNER' | 'ADMIN',
  },
} as const;

/** Standard cookie options — httpOnly, lax, secure in production. */
export const cookieOpts = {
  httpOnly: true,
  path:     '/',
  sameSite: 'lax' as const,
  secure:   config.isProd,
};


/** Sign a 15-minute JWT access token for the given user. */
export function signAccessToken(
  fastify: FastifyInstance,
  user: { id: string; email: string; role: string },
): string {
  return fastify.jwt.sign(
    { sub: user.id, email: user.email, role: user.role, iss: config.jwtIssuer },
  );
}

// ─── Session management ───────────────────────────────────────────────────────

interface UserForSession {
  id: string;
  email: string;
  role: string;
}

/**
 * Create a full session: sign an access token, store a refresh token in Redis,
 * set both as httpOnly cookies, and return the response payload.
 *
 * Called by: register, login, MFA-login, refresh, OAuth callbacks.
 */
export async function createSession(
  fastify: FastifyInstance,
  reply:   FastifyReply,
  user:    UserForSession,
) {
  const accessToken = signAccessToken(fastify, user);

  const secret     = crypto.randomBytes(32).toString('hex');
  const tokenHash  = crypto.createHash('sha256').update(secret).digest('hex');
  const refreshToken = `${user.id}.${secret}`;

  await fastify.redis.set(
    `auth:refresh:${user.id}:${tokenHash}`,
    '1',
    'EX',
    config.expiry.refreshToken,
  );

  return reply
    .setCookie('token',        accessToken,  cookieOpts)
    .setCookie('refreshToken', refreshToken, cookieOpts)
    .send({
      token: accessToken,
      user:  { id: user.id, email: user.email, role: user.role },
    });
}

export function clearSessionCookies(reply: FastifyReply): FastifyReply {
  return reply
    .clearCookie('token',        { path: '/' })
    .clearCookie('refreshToken', { path: '/' });
}

export async function invalidateAllSessions(
  fastify: FastifyInstance,
  userId: string,
): Promise<void> {
  const keys = await fastify.redis.keys(`auth:refresh:${userId}:*`);
  if (keys.length > 0) await fastify.redis.del(...keys);
}


export function parseRefreshToken(raw: string | undefined): {
  userId: string;
  redisKey: string;
} | null {
  if (!raw) return null;

  const parts = raw.split('.');
  if (parts.length !== 2) return null;

  const [userId, secret] = parts as [string, string];
  const tokenHash = crypto.createHash('sha256').update(secret).digest('hex');

  return { userId, redisKey: `auth:refresh:${userId}:${tokenHash}` };
}

// ─── Security logging ─────────────────────────────────────────────────────────

type SecurityAction =
  | 'REGISTER'
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'LOGOUT_ALL'
  | 'PASSWORD_RESET'
  | 'LOCKOUT'
  | 'REVOCATION_BREACH';

/** Record a security-relevant event to the audit log. */
export function logSecurityEvent(
  prisma: PrismaClient,
  request: FastifyRequest,
  data: {
    userId?: string | null;
    action: SecurityAction;
    metadata?: Record<string, unknown>;
  },
): Promise<unknown> {
  return prisma.securityLog.create({
    data: {
      userId:    data.userId ?? null,
      action:    data.action,
      ip:        request.ip,
      userAgent: request.headers['user-agent'] ?? null,
      ...(data.metadata ? { metadata: data.metadata as any } : {}),
    },
  });
}


/** Send a structured error response with a stable machine-readable code. */
export function errorReply(
  reply:  FastifyReply,
  status: number,
  code:   string,
  error:  string,
) {
  return reply.status(status).send({ error, code });
}
