import type { FastifyInstance, FastifyRequest } from "fastify";
import { Type, type Static } from "@sinclair/typebox";
import argon2 from "argon2";
import crypto from "crypto";
import { trace } from "@devops/observability";
import { prisma } from "../utils/db";
import type { Prisma } from "@devops/db";
import {
  config,
  errorReply,
  createSession,
  setSessionCookies,
  clearSessionCookies,
  invalidateAllSessions,
  parseRefreshToken,
  logSecurityEvent,
  trackLogin,
  denylistAccessToken,
  isTokenDenylisted,
} from "../utils/session";

const tracer = trace.getTracer("auth-service");

//  Schemas

const RegisterSchema = Type.Object({
  email: Type.String({ format: "email" }),
  password: Type.String({ minLength: 8 }),
  name: Type.Optional(Type.String()),
});

const LoginSchema = Type.Object({
  email: Type.String({ format: "email" }),
  password: Type.String(),
});

const VerifyEmailSchema = Type.Object({
  token: Type.String(),
});

const ForgotPasswordSchema = Type.Object({
  email: Type.String({ format: "email" }),
});

const ResetPasswordSchema = Type.Object({
  token: Type.String(),
  newPassword: Type.String({ minLength: 8 }),
});

const UpdateProfileSchema = Type.Object({
  name: Type.Optional(Type.String()),
  jobTitle: Type.Optional(Type.String()),
});

const ChangePasswordSchema = Type.Object({
  currentPassword: Type.String(),
  newPassword: Type.String({ minLength: 8 }),
});

//  Internal helpers

/** Increment failed-login counter; lock the account when the limit is hit. */
/**
 *
 * @param fastify
 * @param request
 * @param email
 * @param userId
 */
async function handleLoginFail(
  fastify: FastifyInstance,
  request: FastifyRequest,
  email: string,
  userId?: string
): Promise<void> {
  const failsKey = `auth:fails:${email}`;
  const lockoutKey = `auth:lockout:${email}`;

  const fails = await fastify.redis.incr(failsKey);
  if (fails === 1) {
    await fastify.redis.expire(failsKey, config.expiry.lockout);
  }
  if (fails >= config.security.maxFailedAttempts) {
    await fastify.redis.set(lockoutKey, "1", "EX", config.expiry.lockout);
  }

  await logSecurityEvent(prisma, request, {
    userId: userId ?? null,
    action: "LOGIN_FAILED",
    metadata: { email },
  });
}

export async function accountRoutes(fastify: FastifyInstance): Promise<void> {
  // PreHandler hook: verify access token JTI is not denylisted in Redis
  fastify.addHook("preHandler", async (req, reply) => {
    if (req.user?.jti) {
      if (await isTokenDenylisted(fastify, req.user.jti)) {
        return errorReply(reply, 401, "UNAUTHORIZED", "Token has been revoked");
      }
    }
  });

  fastify.get("/public-key", async () => ({
    publicKey: fastify.jwtPublicKey,
  }));

  fastify.post(
    "/register",
    { schema: { body: RegisterSchema } },
    async (req: FastifyRequest<{ Body: Static<typeof RegisterSchema> }>, reply) => {
      return tracer.startActiveSpan("auth.register", async (span) => {
        try {
          const { email, password, name } = req.body;
          span.setAttribute("auth.email", email);

          if (await prisma.user.findUnique({ where: { email } })) {
            span.setAttribute("auth.outcome", "user_exists");
            fastify.log.info({ email }, "Register failed: user exists");
            fastify.metrics.registerCounter.inc({ outcome: "user_exists" }); //this is fast because only increments the counter in memory control blockl and then metrics endpoint scrapes later (can be synchronous)
            return errorReply(reply, 400, "USER_EXISTS", "User already exists");
          }

          const hashedPassword = await argon2.hash(password);
          const verificationToken = crypto.randomUUID();

          // Create user + outbox events + audit log in a single transaction.
          const user = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            const u = await tx.user.create({
              data: {
                email,
                password: hashedPassword,
                name: name ?? null,
                role: config.defaults.role,
              },
            });

            await tx.authOutboxEvent.create({
              data: {
                eventType: "UserRegisteredEvent",
                payload: { userId: u.id, email: u.email, name: u.name },
              },
            });

            await tx.authOutboxEvent.create({
              data: {
                eventType: "EmailVerificationRequestedEvent",
                payload: { userId: u.id, email: u.email, token: verificationToken },
              },
            });

            await tx.securityLog.create({
              data: {
                userId: u.id,
                action: "REGISTER",
                ip: req.ip,
                userAgent: req.headers["user-agent"] ?? null,
              },
            });

            return u;
          });

          // Store verification token in Redis (24 h default).
          await fastify.redis.set(
            `auth:verify-email:${verificationToken}`,
            user.id,
            "EX",
            config.expiry.emailVerification
          );

          span.setAttribute("auth.outcome", "success");
          span.setAttribute("auth.user_id", user.id);
          fastify.metrics.registerCounter.inc({ outcome: "success" });
          reply.status(201);
          return await createSession(fastify, reply, user);
        } catch (err) {
          span.setAttribute("auth.outcome", "error");
          span.recordException(err as Error);
          fastify.metrics.registerCounter.inc({ outcome: "error" });
          throw err;
        } finally {
          span.end();
        }
      });
    }
  );

  fastify.post(
    "/login",
    { schema: { body: LoginSchema } },
    async (req: FastifyRequest<{ Body: Static<typeof LoginSchema> }>, reply) => {
      return tracer.startActiveSpan("auth.login", async (span) => {
        const loginTimer = fastify.metrics.loginDuration.startTimer();
        try {
          const { email, password } = req.body;
          span.setAttribute("auth.email", email);

          const lockoutKey = `auth:lockout:${email}`;

          // 1. Check lockout.
          if (await fastify.redis.get(lockoutKey)) {
            await logSecurityEvent(prisma, req, { action: "LOCKOUT", metadata: { email } });
            fastify.log.warn({ email }, "Login attempt while account locked");
            span.setAttribute("auth.outcome", "account_locked");
            fastify.metrics.loginCounter.inc({ outcome: "account_locked" });
            loginTimer();
            return errorReply(
              reply,
              429,
              "ACCOUNT_LOCKED",
              "Account locked due to too many failed attempts. Try again later."
            );
          }

          // 2. Look up user.
          const user = await req.prisma.user.findUnique({ where: { email } });

          if (!user?.password) {
            await handleLoginFail(fastify, req, email, user?.id);
            fastify.log.warn({ email }, "Login failed: user has no password (OAuth)");
            span.setAttribute("auth.outcome", "invalid_credentials");
            fastify.metrics.loginCounter.inc({ outcome: "invalid_credentials" });
            loginTimer();
            return errorReply(reply, 401, "INVALID_CREDENTIALS", "Invalid credentials");
          }

          // 3. Verify password.
          if (!(await argon2.verify(user.password, password))) {
            await handleLoginFail(fastify, req, email, user.id);
            fastify.log.warn({ email, userId: user.id }, "Login failed: invalid password");
            span.setAttribute("auth.outcome", "invalid_credentials");
            fastify.metrics.loginCounter.inc({ outcome: "invalid_credentials" });
            loginTimer();
            return errorReply(reply, 401, "INVALID_CREDENTIALS", "Invalid credentials");
          }

          // 4. Clear fail counter.
          await fastify.redis.del(`auth:fails:${email}`);

          await logSecurityEvent(prisma, req, { userId: user.id, action: "LOGIN_SUCCESS" });

          // 5. MFA gate — return a short-lived pending token instead of a session.
          if (user.mfaEnabled) {
            const mfaToken = fastify.jwt.sign(
              { sub: user.id, pendingMfa: true },
              { expiresIn: config.expiry.mfaToken }
            );
            span.setAttribute("auth.outcome", "mfa_required");
            span.setAttribute("auth.user_id", user.id);
            fastify.metrics.loginCounter.inc({ outcome: "mfa_required" });
            loginTimer();
            return reply.send({ mfaRequired: true, mfaToken });
          }

          // 6. Create session.
          span.setAttribute("auth.outcome", "success");
          span.setAttribute("auth.user_id", user.id);
          fastify.metrics.loginCounter.inc({ outcome: "success" });
          loginTimer();

          const { accessToken, tokenHash } = await setSessionCookies(fastify, reply, user);
          await trackLogin(req, user.id, tokenHash);
          return reply.send({
            token: accessToken,
            user: { id: user.id, email: user.email, role: user.role },
          });
        } catch (err) {
          span.setAttribute("auth.outcome", "error");
          span.recordException(err as Error);
          fastify.metrics.loginCounter.inc({ outcome: "error" });
          loginTimer();
          throw err;
        } finally {
          span.end();
        }
      });
    }
  );

  // ── Verify email ────────────────────────────────────────────────────────────

  fastify.post("/verify-email", { schema: { body: VerifyEmailSchema } }, async (req, reply) => {
    return tracer.startActiveSpan("auth.verify_email", async (span) => {
      try {
        const { token } = req.body as Static<typeof VerifyEmailSchema>;
        const userId = await fastify.redis.get(`auth:verify-email:${token}`);

        if (!userId) {
          span.setAttribute("auth.outcome", "invalid_token");
          fastify.log.info({ token }, "Email verification failed: invalid or expired token");
          return errorReply(
            reply,
            400,
            "INVALID_VERIFICATION_TOKEN",
            "Invalid or expired verification token"
          );
        }

        await req.prisma.user.update({ where: { id: userId }, data: { emailVerified: new Date() } });
        await fastify.redis.del(`auth:verify-email:${token}`);
        span.setAttribute("auth.outcome", "success");
        span.setAttribute("auth.user_id", userId);

        return reply.send({ success: true });
      } catch (err) {
        span.recordException(err as Error);
        throw err;
      } finally {
        span.end();
      }
    });
  });

  // ── Forgot password ─────────────────────────────────────────────────────────

  fastify.post(
    "/forgot-password",
    { schema: { body: ForgotPasswordSchema } },
    async (req, reply) => {
      return tracer.startActiveSpan("auth.forgot_password", async (span) => {
        try {
          const { email } = req.body as Static<typeof ForgotPasswordSchema>;
          span.setAttribute("auth.email", email);
          const user = await req.prisma.user.findUnique({ where: { email } });

          if (user) {
            const resetToken = crypto.randomBytes(32).toString("hex");

            // AUTH-006 FIX: Write outbox event inside transaction, then set Redis.
            // If Redis fails, the email is still queued (acceptable — token just won't work).
            await req.prisma.$transaction(
              async (tx: Parameters<Parameters<typeof req.prisma.$transaction>[0]>[0]) => {
                await tx.authOutboxEvent.create({
                  data: {
                    eventType: "PasswordResetRequestedEvent",
                    payload: { userId: user.id, email: user.email, token: resetToken },
                  },
                });
              }
            );

            await fastify.redis.set(
              `auth:reset-password:${resetToken}`,
              user.id,
              "EX",
              config.expiry.passwordReset
            );
            span.setAttribute("auth.user_id", user.id);
          }

          span.setAttribute("auth.outcome", "success");
          // Always return success to prevent email enumeration.
          return reply.send({
            success: true,
            message: "If the email exists, a password reset link has been sent.",
          });
        } catch (err) {
          span.recordException(err as Error);
          throw err;
        } finally {
          span.end();
        }
      });
    }
  );

  // ── Reset password ──────────────────────────────────────────────────────────

  fastify.post("/reset-password", { schema: { body: ResetPasswordSchema } }, async (req, reply) => {
    return tracer.startActiveSpan("auth.reset_password", async (span) => {
      try {
        const { token, newPassword } = req.body as Static<typeof ResetPasswordSchema>;
        const userId = await fastify.redis.get(`auth:reset-password:${token}`);

        if (!userId) {
          span.setAttribute("auth.outcome", "invalid_token");
          return errorReply(reply, 400, "INVALID_RESET_TOKEN", "Invalid or expired reset token");
        }

        const hashedPassword = await argon2.hash(newPassword);

        await req.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
          await tx.user.update({ where: { id: userId }, data: { password: hashedPassword } });
          await tx.securityLog.create({
            data: {
              userId,
              action: "PASSWORD_RESET",
              ip: req.ip,
              userAgent: req.headers["user-agent"] ?? null,
            },
          });
        });

        await fastify.redis.del(`auth:reset-password:${token}`);
        await invalidateAllSessions(fastify, userId);
        span.setAttribute("auth.outcome", "success");
        span.setAttribute("auth.user_id", userId);

        return reply.send({ success: true });
      } catch (err) {
        span.recordException(err as Error);
        throw err;
      } finally {
        span.end();
      }
    });
  });

  // ── Refresh token rotation ──────────────────────────────────────────────────

  fastify.post("/refresh", async (req, reply) => {
    const parsed = parseRefreshToken(req.cookies["refreshToken"]);

    if (!parsed) {
      return errorReply(reply, 401, "REFRESH_TOKEN_MISSING", "Refresh token missing or malformed");
    }

    const { userId, redisKey } = parsed;

    // Validate against Redis.
    const tokenState = await fastify.redis.get(redisKey);

    if (!tokenState) {
      // Key expired naturally or was logged out. Do NOT nuke sessions.
      return errorReply(
        reply,
        401,
        "SESSION_EXPIRED",
        "Session expired. Please login again."
      );
    }

    if (tokenState !== "1") {
      try {
        const parsedState = JSON.parse(tokenState) as { status: string; rotatedAt: number };
        if (parsedState.status === "ROTATED") {
          // Check grace period (10 seconds)
          if (Date.now() - parsedState.rotatedAt <= 10000) {
            fastify.log.info({ userId }, "Concurrent refresh request honored within grace period");
          } else {
            // Replay attack! The token was rotated and the grace period passed.
            await invalidateAllSessions(fastify, userId);
            fastify.log.warn({ userId }, "Refresh breach detected — invalidating all sessions");

            await logSecurityEvent(req.prisma, req, {
              userId,
              action: "REVOCATION_BREACH",
              metadata: { tokenHash: redisKey.split(":").pop() },
            });

            return errorReply(
              reply,
              401,
              "SESSION_COMPROMISED",
              "Session compromised. Please login again."
            );
          }
        }
      } catch {
        // Fallback for any weird state
        return errorReply(reply, 401, "SESSION_EXPIRED", "Session expired.");
      }
    } else {
      // Rotate: mark old as rotated with a timestamp, keep it alive to detect replays
      const rotatedState = JSON.stringify({ status: "ROTATED", rotatedAt: Date.now() });
      await fastify.redis.set(redisKey, rotatedState, "EX", config.expiry.refreshToken);
    }

    const user = await req.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return errorReply(reply, 401, "USER_NOT_FOUND", "User not found");
    }

    return createSession(fastify, reply, user);
  });

  // ── OAuth exchange-token ─────────────────────────────────────────────────────
  // After a successful OAuth login the browser holds a short-lived single-use
  // exchange_token (UUID) that was placed in the redirect URL query string.
  // The frontend immediately POSTs it here (same-origin XHR from localhost:3000
  // to localhost:8005) so cookies can be set in a normal response — not on a
  // cross-site redirect where browser SameSite/timing rules would block them.

  const ExchangeSchema = Type.Object({
    exchange_token: Type.String({ format: "uuid" }),
  });

  fastify.post(
    "/exchange",
    { schema: { body: ExchangeSchema } },
    async (req: FastifyRequest<{ Body: Static<typeof ExchangeSchema> }>, reply) => {
      const { exchange_token } = req.body;
      const redisKey = `auth:exchange:${exchange_token}`;

      // Single-use: atomically get + delete so a second call always fails.
      const userId = await fastify.redis.getdel(redisKey);

      if (!userId) {
        // Token expired, already used, or never existed.
        return errorReply(reply, 401, "EXCHANGE_TOKEN_INVALID", "OAuth exchange token is invalid or expired");
      }

      const user = await req.prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        return errorReply(reply, 401, "USER_NOT_FOUND", "User not found");
      }

      // setSessionCookies sets both 'token' and 'refreshToken' cookies and returns
      // the access token + user. We send the user back so the frontend can update
      // its SWR cache without making an additional /me round-trip.
      await setSessionCookies(fastify, reply, user);
      return reply.send({
        user: { id: user.id, email: user.email, role: user.role },
      });
    }
  );

  // ── Get profile ─────────────────────────────────────────────────────────────

  fastify.get(
    "/me",
    {
      onRequest: [
        async (request, _reply) => {
          try {
            await request.jwtVerify();
          } catch (err) {
            request.log.info(
              { err, url: request.url, hasAuthHeader: Boolean(request.headers["authorization"]) },
              "JWT verification failed for /me"
            );
            throw err;
          }
        },
      ],
    },
    async (req, reply) => {
      const { sub } = req.user;

      const user = await req.prisma.user.findUnique({
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
          onboardingState: true,
          avatarUrl: true,
          jobTitle: true,
          currentStreak: true,
          longestStreak: true,
          firstLoginAt: true,
          lastLoginAt: true,
          githubId: true,
          googleId: true,
          notificationPref: true,
          badges: {
            include: { badge: true },
          },
        },
      });

      if (!user) {
        req.log.info({ userId: sub }, "User not found for /me");
        return errorReply(reply, 404, "USER_NOT_FOUND", "User not found");
      }

      // AUTH-003 FIX: Check hasPassword without selecting the hash
      const passwordCheck = await req.prisma.user.findUnique({
        where: { id: sub },
        select: { password: true },
      });

      return { ...user, hasPassword: !!passwordCheck?.password };
    }
  );

  // ── Update profile ──────────────────────────────────────────────────────────

  fastify.put(
    "/me",
    { schema: { body: UpdateProfileSchema }, onRequest: [async (r) => r.jwtVerify()] },
    async (req, reply) => {
      const { sub } = req.user;
      const { name, jobTitle } = req.body as Static<typeof UpdateProfileSchema>;

      const updateData: Record<string, string> = {};
      if (name !== undefined) updateData["name"] = name;
      if (jobTitle !== undefined) updateData["jobTitle"] = jobTitle;

      const user = await req.prisma.user.update({
        where: { id: sub },
        data: updateData,
        select: { id: true, name: true, email: true, jobTitle: true },
      });

      return reply.send({ success: true, message: "Profile updated successfully", user });
    }
  );

  // ── Change password ─────────────────────────────────────────────────────────

  fastify.post(
    "/change-password",
    { schema: { body: ChangePasswordSchema }, onRequest: [async (r) => r.jwtVerify()] },
    async (req, reply) => {
      return tracer.startActiveSpan("auth.change_password", async (span) => {
        try {
          const { sub } = req.user;
          span.setAttribute("auth.user_id", sub);
          const { currentPassword, newPassword } = req.body as Static<typeof ChangePasswordSchema>;

          const user = await req.prisma.user.findUnique({ where: { id: sub } });
          if (!user) return errorReply(reply, 404, "USER_NOT_FOUND", "User not found");
          if (!user.password)
            return errorReply(reply, 400, "OAUTH_NO_PASSWORD", "User uses OAuth and has no password");

          if (!(await argon2.verify(user.password, currentPassword))) {
            span.setAttribute("auth.outcome", "invalid_current_password");
            return errorReply(reply, 401, "INCORRECT_PASSWORD", "Incorrect current password");
          }

          await req.prisma.user.update({
            where: { id: sub },
            data: { password: await argon2.hash(newPassword) },
          });
          span.setAttribute("auth.outcome", "success");
          return reply.send({ success: true });
        } catch (err) {
          span.recordException(err as Error);
          throw err;
        } finally {
          span.end();
        }
      });
    }
  );

  // ── Delete account ──────────────────────────────────────────────────────────

  fastify.delete("/me", { onRequest: [async (r) => r.jwtVerify()] }, async (req, reply) => {
    return tracer.startActiveSpan("auth.delete_account", async (span) => {
      try {
        const { sub } = req.user;
        span.setAttribute("auth.user_id", sub);

        await req.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
          await tx.authOutboxEvent.create({
            data: { eventType: "UserDeletedEvent", payload: { userId: sub } },
          });
          await tx.securityLog.deleteMany({ where: { userId: sub } });
          await tx.submission.deleteMany({ where: { userId: sub } });
          await tx.completion.deleteMany({ where: { userId: sub } });
          await tx.labSession.deleteMany({ where: { userId: sub } });
          await tx.user.delete({ where: { id: sub } });
        });

        await invalidateAllSessions(fastify, sub);
        span.setAttribute("auth.outcome", "success");

        return clearSessionCookies(reply).send({ success: true });
      } catch (err) {
        span.recordException(err as Error);
        throw err;
      } finally {
        span.end();
      }
    });
  });

  // ── Logout (single session) ─────────────────────────────────────────────────

  fastify.post("/logout", async (req, reply) => {
    return tracer.startActiveSpan("auth.logout", async (span) => {
      try {
        try {
          await req.jwtVerify();
        } catch {}

        const parsed = parseRefreshToken(req.cookies["refreshToken"]);

        if (parsed) {
          await fastify.redis.del(parsed.redisKey);
          await logSecurityEvent(prisma, req, { userId: parsed.userId, action: "LOGOUT" });
          span.setAttribute("auth.user_id", parsed.userId);
        }

        if (req.user?.jti) {
          await denylistAccessToken(fastify, req.user.jti);
        }

        span.setAttribute("auth.outcome", "success");
        return clearSessionCookies(reply).send({ success: true });
      } catch (err) {
        span.recordException(err as Error);
        throw err;
      } finally {
        span.end();
      }
    });
  });

  // ── Logout (all sessions) ───────────────────────────────────────────────────

  fastify.post("/logout-all", { onRequest: [async (r) => r.jwtVerify()] }, async (req, reply) => {
    return tracer.startActiveSpan("auth.logout_all", async (span) => {
      try {
        const { sub, jti } = req.user;
        span.setAttribute("auth.user_id", sub);

        await invalidateAllSessions(fastify, sub);
        if (jti) {
          await denylistAccessToken(fastify, jti);
        }
        await logSecurityEvent(prisma, req, { userId: sub, action: "LOGOUT_ALL" });
        span.setAttribute("auth.outcome", "success");

        return clearSessionCookies(reply).send({ success: true });
      } catch (err) {
        span.recordException(err as Error);
        throw err;
      } finally {
        span.end();
      }
    });
  });

const SecurityLogQuerySchema = Type.Object({
  page: Type.Optional(Type.String({ pattern: "^[0-9]+$" })),
  limit: Type.Optional(Type.String({ pattern: "^[0-9]+$" })),
});

  // ── Security Log ────────────────────────────────────────────────────────────

  fastify.get(
    "/security-log",
    {
      onRequest: [async (r) => r.jwtVerify()],
      schema: { querystring: SecurityLogQuerySchema },
    },
    async (req, _reply) => {
      const { sub } = req.user;
      const query = req.query as { page?: string; limit?: string };
      const rawPage = parseInt(query?.page || "1", 10);
      const rawLimit = parseInt(query?.limit || "20", 10);
      const page = isNaN(rawPage) || rawPage < 1 ? 1 : rawPage;
      const limit = isNaN(rawLimit) || rawLimit < 1 ? 20 : Math.min(rawLimit, 100);

      const logs = await prisma.securityLog.findMany({
        where: { userId: sub },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      });

      const total = await prisma.securityLog.count({ where: { userId: sub } });

      return { logs, total, page, limit };
    }
  );

  // ── Active Sessions ─────────────────────────────────────────────────────────

  fastify.get("/sessions", { onRequest: [async (r) => r.jwtVerify()] }, async (req, _reply) => {
    const { sub } = req.user;
    const sessions = await prisma.userSession.findMany({
      where: { userId: sub, revokedAt: null },
      orderBy: { lastSeenAt: "desc" },
    });
    return sessions;
  });

  fastify.post(
    "/sessions/:sessionId/revoke",
    { onRequest: [async (r) => r.jwtVerify()] },
    async (req, reply) => {
      return tracer.startActiveSpan("auth.revoke_session", async (span) => {
        try {
          const { sub } = req.user;
          const { sessionId } = req.params as { sessionId: string };
          span.setAttribute("auth.user_id", sub);
          span.setAttribute("auth.session_id", sessionId);

          const session = await prisma.userSession.findFirst({
            where: { id: sessionId, userId: sub, revokedAt: null },
          });

          if (!session) {
            span.setAttribute("auth.outcome", "session_not_found");
            return errorReply(reply, 404, "SESSION_NOT_FOUND", "Active session not found");
          }

          await prisma.userSession.update({
            where: { id: session.id },
            data: { revokedAt: new Date() },
          });

          if (session.tokenHash) {
            await fastify.redis.del(`auth:refresh:${sub}:${session.tokenHash}`);
          }

          span.setAttribute("auth.outcome", "success");
          return reply.send({ success: true });
        } catch (err) {
          span.recordException(err as Error);
          throw err;
        } finally {
          span.end();
        }
      });
    }
  );
}
