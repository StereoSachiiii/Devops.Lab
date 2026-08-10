import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { PrismaClient } from "@devops/db";
import { prisma } from "./db";
import crypto from "crypto";
import { requireEnv } from "@devops/observability";

/** Parse a duration string like "30d", "15m", "1h" into seconds. */
function parseDurationToSeconds(duration: string): number {
  const match = duration.match(/^(\d+)(s|m|h|d)$/);
  if (!match) {
    throw new Error(`Invalid duration format: "${duration}". Expected e.g. "30d", "1h", "15m".`);
  }
  const value = parseInt(match[1] as string, 10);
  const unit = match[2] as string;
  switch (unit) {
    case "s":
      return value;
    case "m":
      return value * 60;
    case "h":
      return value * 3600;
    case "d":
      return value * 86400;
    default:
      throw new Error(`Unknown duration unit: ${unit}`);
  }
}

declare module "fastify" {
  interface FastifyInstance {
    jwtPublicKey: string;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    user: {
      sub: string;
      id: string;
      email: string;
      role: string;
      orgId?: string;
      iss?: string;
      pendingMfa?: boolean;
    };
  }
}

export const config = {
  // Common JWT payload values
  jwtIssuer: requireEnv("JWT_ISSUER"),
  mfaAppName: requireEnv("MFA_APP_NAME"),
  frontendUrl: requireEnv("FRONTEND_URL"),
  isProd: requireEnv("NODE_ENV") === "production",

  expiry: {
    // Session token: e.g. 7 days. Once expired, requires full re-login.
    sessionToken: "7d",
    // Access token: e.g. 15 mins. Shorter lifetime for API access.
    accessToken: "15m",
    // MFA token: Short-lived token purely for the MFA challenge step
    mfaToken: requireEnv("EXPIRY_MFA_TOKEN"),
    refreshToken: parseDurationToSeconds(process.env["EXPIRY_REFRESH_TOKEN"] || "30d"),
    lockout: 15 * 60,
    passwordReset: 60 * 60,
    emailVerification: 24 * 60 * 60,
  },

  security: {
    maxFailedAttempts: 5,
  },

  // Defaults for new users
  defaults: {
    role: requireEnv("DEFAULT_USER_ROLE") as "LEARNER" | "ADMIN",
  },
} as const;

/** Standard cookie options — httpOnly, lax, secure in production. */
const cookieDomain = process.env["COOKIE_DOMAIN"];
export const cookieOpts = {
  httpOnly: true,
  path: "/",
  sameSite: "lax" as const,
  secure: config.isProd,
  ...(cookieDomain ? { domain: cookieDomain } : {}),
};

/** Sign a 15-minute JWT access token for the given user. */
export function signAccessToken(
  fastify: FastifyInstance,
  user: { id: string; email: string; role: string; orgId?: string | null }
): string {
  return fastify.jwt.sign({
    sub: user.id,
    email: user.email,
    role: user.role,
    orgId: user.orgId || undefined,
    iss: config.jwtIssuer,
  });
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
export async function setSessionCookies(
  fastify: FastifyInstance,
  reply: FastifyReply,
  user: UserForSession
) {
  const accessToken = signAccessToken(fastify, user);

  const secret = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(secret).digest("hex");
  const refreshToken = `${user.id}.${secret}`;

  await fastify.redis.set(
    `auth:refresh:${user.id}:${tokenHash}`,
    "1",
    "EX",
    config.expiry.refreshToken
  );

  reply
    .setCookie("token", accessToken, cookieOpts)
    .setCookie("refreshToken", refreshToken, cookieOpts);

  return { accessToken, user };
}

export async function createSession(
  fastify: FastifyInstance,
  reply: FastifyReply,
  user: UserForSession
) {
  const { accessToken } = await setSessionCookies(fastify, reply, user);

  return reply.send({
    token: accessToken,
    user: { id: user.id, email: user.email, role: user.role },
  });
}

export async function trackLogin(request: FastifyRequest, userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { firstLoginAt: true },
  });

  await prisma.user.update({
    where: { id: userId },
    data: {
      lastLoginAt: new Date(),
      ...(user?.firstLoginAt ? {} : { firstLoginAt: new Date() }),
    },
  });

  return prisma.userSession.create({
    data: {
      userId,
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
    },
  });
}

export function clearSessionCookies(reply: FastifyReply): FastifyReply {
  return reply.clearCookie("token", { path: "/" }).clearCookie("refreshToken", { path: "/" });
}

export async function invalidateAllSessions(
  fastify: FastifyInstance,
  userId: string
): Promise<void> {
  // AUTH-005 FIX: Use SCAN instead of KEYS to avoid blocking Redis
  const pattern = `auth:refresh:${userId}:*`;
  let cursor = "0";
  do {
    const [nextCursor, keys] = await fastify.redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
    cursor = nextCursor;
    if (keys.length > 0) {
      await fastify.redis.del(...keys);
    }
  } while (cursor !== "0");

  await prisma.userSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export function parseRefreshToken(raw: string | undefined): {
  userId: string;
  redisKey: string;
} | null {
  if (!raw) return null;

  const parts = raw.split(".");
  if (parts.length !== 2) return null;

  const [userId, secret] = parts as [string, string];

  const tokenHash = crypto.createHash("sha256").update(secret).digest("hex");

  return { userId, redisKey: `auth:refresh:${userId}:${tokenHash}` };
}

// ─── Security logging ─────────────────────────────────────────────────────────

type SecurityAction =
  | "REGISTER"
  | "LOGIN_SUCCESS"
  | "LOGIN_FAILED"
  | "LOGOUT"
  | "LOGOUT_ALL"
  | "PASSWORD_RESET"
  | "LOCKOUT"
  | "REVOCATION_BREACH";

/** Record a security-relevant event to the audit log. */
export function logSecurityEvent(
  prisma: PrismaClient,
  request: FastifyRequest,
  data: {
    userId?: string | null;
    action: SecurityAction;
    metadata?: Record<string, unknown>;
  }
): Promise<unknown> {
  return prisma.securityLog.create({
    data: {
      userId: data.userId ?? null,
      action: data.action,
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
      ...(data.metadata ? { metadata: data.metadata as any } : {}),
    },
  });
}

/** Send a structured error response with a stable machine-readable code. */
export function errorReply(reply: FastifyReply, status: number, code: string, error: string) {
  return reply.status(status).send({ error, code });
}
