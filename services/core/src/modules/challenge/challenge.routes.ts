import { randomUUID } from "crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  SessionStartedEvent,
  SessionEndedEvent,
  SessionEndReason,
  QUEUES,
} from "@devops/messaging";

// Circuit Breaker state for sandbox-router health probes
let probeCircuitOpenUntil = 0;
let consecutiveProbeFailures = 0;
const PROBE_FAILURE_THRESHOLD = 3;
const CIRCUIT_COOLDOWN_MS = 15_000;

export async function challengeRoutes(fastify: FastifyInstance) {
  const getGatewayUrls = (sessionId: string) => {
    const gatewayUrl = process.env["PUBLIC_GATEWAY_URL"] || "http://localhost:8000";
    const cleanUrl = gatewayUrl.endsWith("/") ? gatewayUrl.slice(0, -1) : gatewayUrl;
    const wsProto = cleanUrl.startsWith("https://") ? "wss://" : "ws://";
    const hostPart = cleanUrl.replace(/^https?:\/\//, "");
    return {
      terminalUrl: `${wsProto}${hostPart}/sessions/${sessionId}/terminal`,
      validateUrl: `${cleanUrl}/validate/${sessionId}`,
    };
  };

  fastify.get("/challenges", async (req: FastifyRequest, reply) => {
    let userOrgId: string | null = null;
    try {
      await req.jwtVerify();
      const user = req.user as { sub: string } | undefined;
      if (user?.sub) {
        const userDb = await req.prisma.user.findUnique({ where: { id: user.sub }, select: { orgId: true } });
        userOrgId = userDb?.orgId ?? null;
      }
    } catch {}

    const challenges = await req.prisma.challenge.findMany({
      where: {
        OR: [
          { contributedByOrgId: null },
          ...(userOrgId ? [{ contributedByOrgId: userOrgId }] : []),
        ],
      },
      select: {
        id: true,
        title: true,
        description: true,
        difficulty: true,
        category: true,
        tags: true,
        xp: true,
        module: { select: { title: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    return reply.send(challenges);
  });

  fastify.get("/challenges/:id", async (req: FastifyRequest, reply) => {
    const { id } = req.params as { id: string };

    let userOrgId: string | null = null;
    try {
      await req.jwtVerify();
      const user = req.user as { sub: string } | undefined;
      if (user?.sub) {
        const userDb = await req.prisma.user.findUnique({ where: { id: user.sub }, select: { orgId: true } });
        userOrgId = userDb?.orgId ?? null;
      }
    } catch {}

    const challenge = await req.prisma.challenge.findUnique({
      where: { id },
      include: { module: { select: { title: true, path: { select: { title: true } } } } },
    });
    if (!challenge) {
      fastify.log.info({ id }, "Challenge not found");
      return reply.code(404).send({ error: "Challenge not found", code: "NOT_FOUND" });
    }

    if (challenge.contributedByOrgId && challenge.contributedByOrgId !== userOrgId) {
      fastify.log.warn({ id }, "Access denied: challenge belongs to a different organization");
      return reply.code(403).send({ error: "Forbidden: Challenge belongs to a different organization", code: "FORBIDDEN" });
    }

    return reply.send(challenge);
  });

  // GET /challenges/:id/editorial — returns detailed architectural postmortem and solution guide
  fastify.get(
    "/challenges/:id/editorial",
    { preHandler: [fastify.authenticate] },
    async (req: FastifyRequest, reply) => {
      const { id } = req.params as { id: string };
      const userId = (req.user as { sub: string }).sub;

      const challenge = await req.prisma.challenge.findUnique({
        where: { id },
        include: { module: { select: { title: true, path: { select: { title: true } } } } },
      });

      if (!challenge) {
        return reply.code(404).send({ error: "Challenge not found", code: "NOT_FOUND" });
      }

      // Check user role & solved status
      const user = await req.prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
      });

      const isPrivileged = user?.role === "ADMIN" || user?.role === "CONTRIBUTOR";

      if (!isPrivileged) {
        // Check if user has completed the challenge
        const completedSession = await req.prisma.labSession.findFirst({
          where: { userId, challengeId: id, status: "COMPLETED" },
        });

        const completionRecord = !completedSession
          ? await req.prisma.completion.findUnique({
              where: { userId_nodeId: { userId, nodeId: id } },
            })
          : null;

        const hasSolved = !!completedSession || !!completionRecord;

        if (!hasSolved) {
          return reply.code(403).send({
            error: "Editorial locked. Solve this challenge first to view the official solution and deep dive.",
            code: "EDITORIAL_LOCKED",
            canUnlock: true,
            challengeId: id,
          });
        }
      }

      if (!challenge.editorial) {
        return reply.code(404).send({
          error: "No official editorial guide has been published for this challenge yet.",
          code: "NO_EDITORIAL_AVAILABLE",
        });
      }

      return reply.send({
        id: challenge.id,
        title: challenge.title,
        category: challenge.category,
        difficulty: challenge.difficulty,
        editorial: challenge.editorial,
        authorNotes: challenge.authorNotes || null,
      });
    }
  );

  fastify.post(
    "/challenges/:id/start",
    { preHandler: [fastify.authenticate] },
    async (req: FastifyRequest, reply) => {
      const user = req.user as { sub: string };
      const { id } = req.params as { id: string };

      const challenge = await req.prisma.challenge.findUnique({
        where: { id },
        select: { id: true, dockerImage: true, title: true, contributedByOrgId: true, requiredProvider: true },
      });
      if (!challenge) {
        fastify.log.warn({ id, userId: user?.sub ?? null }, "Start failed: challenge not found");
        return reply.code(404).send({ error: "Challenge not found", code: "NOT_FOUND" });
      }

      // Concurrency Limit Check
      const userDb = await req.prisma.user.findUnique({
        where: { id: user.sub },
        include: { org: true },
      });

      if (challenge.contributedByOrgId && challenge.contributedByOrgId !== userDb?.orgId) {
        fastify.log.warn({ id, userId: user.sub, orgId: userDb?.orgId }, "Start failed: forbidden (org mismatch)");
        return reply.code(403).send({ error: "Forbidden: Challenge belongs to a different organization", code: "FORBIDDEN" });
      }

      // Check for an existing ACTIVE session for this specific user + challenge combination
      const existingSession = await req.prisma.labSession.findFirst({
        where: { userId: user.sub, challengeId: challenge.id, status: "ACTIVE" },
      });

      if (existingSession) {
        let isAlive = false;
        const now = Date.now();
        const isCircuitOpen = now < probeCircuitOpenUntil;

        if (isCircuitOpen) {
          fastify.log.warn(
            { sessionId: existingSession.id },
            "Sandbox-router probe circuit is OPEN — skipping probe and recycling session"
          );
        } else {
          try {
            const authHeader = req.headers.authorization;
            const healthRes = await fetch(
              `http://sandbox-router:8080/sessions/${existingSession.id}/health`,
              {
                headers: authHeader ? { authorization: authHeader } : {},
                signal: AbortSignal.timeout(2000),
              }
            );
            if (healthRes.status === 200) {
              const body = (await healthRes.json()) as { alive?: boolean };
              isAlive = !!body.alive;
              consecutiveProbeFailures = 0; // Reset circuit on success
            } else {
              consecutiveProbeFailures++;
            }
          } catch (e) {
            consecutiveProbeFailures++;
            fastify.log.warn(
              { err: (e as Error).message, failures: consecutiveProbeFailures },
              "Failed to probe session health from sandbox-router"
            );
          }

          if (consecutiveProbeFailures >= PROBE_FAILURE_THRESHOLD) {
            probeCircuitOpenUntil = Date.now() + CIRCUIT_COOLDOWN_MS;
            fastify.log.error(
              { consecutiveProbeFailures, cooldownMs: CIRCUIT_COOLDOWN_MS },
              "Sandbox-router health probe circuit tripped to OPEN"
            );
          }
        }

        if (isAlive) {
          fastify.log.info(
            { sessionId: existingSession.id, userId: user.sub, challengeId: challenge.id },
            "Returning existing active session for challenge"
          );
          return reply.code(200).send({
            sessionId: existingSession.id,
            challengeId: challenge.id,
            challengeTitle: challenge.title,
            ...getGatewayUrls(existingSession.id),
            ttlMins: fastify.sessionTTLMins,
          });
        } else {
          fastify.log.warn(
            { sessionId: existingSession.id, userId: user.sub, challengeId: challenge.id },
            "Existing active session is dead on worker. Terminating in DB."
          );
          await req.prisma.labSession.update({
            where: { id: existingSession.id },
            data: { status: "TERMINATED", endedAt: new Date() },
          });
        }
      }

      const planTier = userDb?.org?.planTier || "FREE";
      const limit = planTier === "PRO" ? 3 : planTier === "TEAM" ? 5 : 1;

      const activeSessions = await req.prisma.labSession.count({
        where: { userId: user.sub, status: "ACTIVE" },
      });

      if (activeSessions >= limit) {
        fastify.log.warn(
          { userId: user.sub, planTier, activeSessions, limit },
          "Start failed: concurrency limit reached"
        );
        return reply
          .code(403)
          .send({
            error: `Concurrency limit reached for tier: ${planTier} (Limit: ${limit})`,
            code: "CONCURRENCY_LIMIT_REACHED",
          });
      }

      // 1. ATOMIC IDEMPOTENCY CHECK via Redis SET NX
      // SET NX is atomic — eliminates the race window between GET and SET.
      // If the key already exists, SET returns null (another request won the race).
      const lockKey = `core:session:${user.sub}:${challenge.id}`;
      const sessionId = randomUUID();
      const acquired = await fastify.redis.set(lockKey, sessionId, "EX", 10, "NX");

      if (!acquired) {
        // Lock already held — fetch the existing session ID and return it
        const cachedSessionId = await fastify.redis.get(lockKey);
        if (cachedSessionId) {
          fastify.log.info(
            { sessionId: cachedSessionId },
            "Returning cached active session from Redis (NX collision)"
          );
          return reply.code(200).send({
            sessionId: cachedSessionId,
            challengeId: challenge.id,
            challengeTitle: challenge.title,
            ...getGatewayUrls(cachedSessionId),
            ttlMins: fastify.sessionTTLMins,
          });
        }
        // Key disappeared between SET NX and GET (expired in <1ms) — fall through and create a new session
      }

      // 2. OUTBOX PATTERN: Write the event + session atomically in one DB transaction.
      // Even if the brokers are temporarily down, the OutboxEvent row survives and
      // the outbox poller will deliver it on recovery.
      const outboxPayload = {
        type: "session.started" as const,
        sessionId,
        userId: user.sub,
        challengeId: challenge.id,
        image: challenge.dockerImage,
        ttlMins: fastify.sessionTTLMins,
        requiredProvider: challenge.requiredProvider || "docker",
      };

      try {
        await req.prisma.$transaction([
          req.prisma.labSession.create({
            data: {
              id: sessionId,
              userId: user.sub,
              challengeId: challenge.id,
              status: "ACTIVE",
            },
          }),
          req.prisma.coreOutboxEvent.create({
            data: {
              eventType: "SessionStartedEvent",
              payload: outboxPayload as object,
            },
          }),
        ]);
      } catch (err) {
        fastify.log.error(
          { err: (err as Error)?.message ?? err },
          "DB transaction failed — rolling back lock"
        );
        await fastify.redis.del(lockKey);
        return reply.code(500).send({ error: "Failed to create session. Please try again later." });
      }

      // 3. BEST-EFFORT broker emission after the transaction commits.
      // If this fails the OutboxEvent poller will retry delivery automatically.
      try {
        await fastify.kafka.emit(new SessionStartedEvent(outboxPayload));
        const queueName = `${QUEUES.PROVISION_SANDBOX}.${challenge.requiredProvider}`;
        await fastify.rabbitmq.publish(queueName, outboxPayload);

        // Mark the outbox event as processed since we published inline successfully
        await req.prisma.coreOutboxEvent.updateMany({
          where: {
            eventType: "SessionStartedEvent",
            payload: { equals: outboxPayload as object },
            processed: false,
          },
          data: { processed: true },
        });
      } catch (err) {
        // Non-fatal: outbox poller will pick this up and retry
        fastify.log.warn(
          { err: (err as Error)?.message ?? err },
          "Broker emit failed — outbox poller will retry"
        );
      }

      fastify.metrics.sessionStartCounter.inc({ challengeId: challenge.id });

      return reply.code(201).send({
        sessionId,
        challengeId: challenge.id,
        challengeTitle: challenge.title,
        ...getGatewayUrls(sessionId),
        ttlMins: fastify.sessionTTLMins,
      });
    }
  );

  fastify.delete("/session/active", { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string };

    const activeSessions = await req.prisma.labSession.findMany({
      where: { userId: user.sub, status: "ACTIVE" },
    });

    for (const session of activeSessions) {
      const payload = {
        type: "session.ended" as const,
        sessionId: session.id,
        reason: SessionEndReason.TERMINATED,
      };

      await req.prisma.$transaction([
        req.prisma.labSession.updateMany({
          where: { id: session.id, status: "ACTIVE" },
          data: { status: "TERMINATED", endedAt: new Date() },
        }),
        req.prisma.coreOutboxEvent.create({
          data: {
            eventType: "SessionEndedEvent",
            payload: payload as object,
          },
        }),
      ]);

      try {
        await fastify.kafka.emit(new SessionEndedEvent(payload));
        await fastify.rabbitmq.publish(QUEUES.TERMINATE_SANDBOX, payload);

        await req.prisma.coreOutboxEvent.updateMany({
          where: {
            eventType: "SessionEndedEvent",
            payload: { equals: payload as object },
            processed: false,
          },
          data: { processed: true },
        });
      } catch (err) {
        fastify.log.warn(
          { err: (err as Error)?.message ?? err },
          "Failed to emit session.ended event for active session cleanup"
        );
      }
      fastify.metrics.sessionEndCounter.inc({ reason: SessionEndReason.TERMINATED });
    }

    return reply.code(200).send({ success: true, count: activeSessions.length });
  });

  fastify.delete("/session/:id", { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { id: sessionId } = req.params as { id: string };

    const payload = {
      type: "session.ended" as const,
      sessionId,
      reason: SessionEndReason.TERMINATED,
    };

    // Core-002 FIX: Use transactional outbox to guarantee delivery
    await req.prisma.$transaction([
      req.prisma.labSession.updateMany({
        where: { id: sessionId, status: "ACTIVE" },
        data: { status: "TERMINATED", endedAt: new Date() },
      }),
      req.prisma.coreOutboxEvent.create({
        data: {
          eventType: "SessionEndedEvent",
          payload: payload as object,
        },
      }),
    ]);

    try {
      await fastify.kafka.emit(new SessionEndedEvent(payload));
      await fastify.rabbitmq.publish(QUEUES.TERMINATE_SANDBOX, payload);

      await req.prisma.coreOutboxEvent.updateMany({
        where: {
          eventType: "SessionEndedEvent",
          payload: { equals: payload as object },
          processed: false,
        },
        data: { processed: true },
      });
    } catch (err) {
      fastify.log.warn(
        { err: (err as Error)?.message ?? err },
        "Failed to emit session.ended event — outbox poller will retry"
      );
    }

    fastify.metrics.sessionEndCounter.inc({ reason: SessionEndReason.TERMINATED });

    return reply.code(200).send({ success: true });
  });

  fastify.get("/session/:id", { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const session = await req.prisma.labSession.findUnique({
      where: { id },
      include: { challenge: { select: { title: true } } },
    });
    if (!session) return reply.code(404).send({ error: "Session not found", code: "NOT_FOUND" });

    return reply.send({
      sessionId: session.id,
      status: session.status,
      challengeTitle: session.challenge.title,
      ...getGatewayUrls(session.id),
      startedAt: session.startedAt,
    });
  });

  fastify.get("/session/:id/health", { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const session = await req.prisma.labSession.findUnique({
      where: { id },
      select: { status: true },
    });
    
    // If session doesn't exist or is not active, it's not alive
    if (!session || session.status !== "ACTIVE") {
      return reply.send({ alive: false });
    }

    // Otherwise assume it's alive or provisioning
    return reply.send({ alive: true });
  });

  fastify.get("/challenges/onboarding-status", { preHandler: [fastify.authenticate] }, async (req: FastifyRequest, reply) => {
    const userSub = (req.user as { sub: string }).sub;
    const user = await req.prisma.user.findUnique({
      where: { id: userSub },
      select: { onboardingState: true },
    });
    return reply.send({ state: user?.onboardingState ?? "NEW", version: 1 });
  });

  fastify.post("/challenges/onboarding-status/complete", { preHandler: [fastify.authenticate] }, async (req: FastifyRequest, reply) => {
    const userSub = (req.user as { sub: string }).sub;
    const updated = await req.prisma.user.update({
      where: { id: userSub },
      data: { onboardingState: "TOUR_COMPLETED" },
      select: { onboardingState: true },
    });
    return reply.send({ state: updated.onboardingState, version: 1 });
  });

  // ── Challenge Interactions ──────────────────────────────────────────────────

  // POST /challenges/:id/like  — toggle like, returns { likes, liked }
  fastify.post("/challenges/:id/like", { preHandler: [fastify.authenticate] }, async (req: FastifyRequest, reply) => {
    const { id } = req.params as { id: string };
    const userId = (req.user as { sub: string }).sub;

    try {
      const challenge = await req.prisma.challenge.findUnique({ where: { id } });
      if (!challenge) return reply.code(404).send({ error: "Challenge not found" });

      const existing = await req.prisma.challengeLike.findUnique({
        where: { challengeId_userId: { challengeId: id, userId } },
      });

      let liked: boolean;
      if (existing) {
        await req.prisma.challengeLike.delete({ where: { challengeId_userId: { challengeId: id, userId } } });
        liked = false;
      } else {
        await req.prisma.challengeLike.create({ data: { challengeId: id, userId } });
        liked = true;
      }

      const likes = await req.prisma.challengeLike.count({ where: { challengeId: id } });
      return reply.send({ likes, liked });
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: "Failed to toggle like" });
    }
  });

  // POST /challenges/:id/bookmark — toggle bookmark, returns { saved }
  fastify.post("/challenges/:id/bookmark", { preHandler: [fastify.authenticate] }, async (req: FastifyRequest, reply) => {
    const { id } = req.params as { id: string };
    const userId = (req.user as { sub: string }).sub;

    try {
      const challenge = await req.prisma.challenge.findUnique({ where: { id } });
      if (!challenge) return reply.code(404).send({ error: "Challenge not found" });

      const existing = await req.prisma.challengeBookmark.findUnique({
        where: { challengeId_userId: { challengeId: id, userId } },
      });

      let saved: boolean;
      if (existing) {
        await req.prisma.challengeBookmark.delete({ where: { challengeId_userId: { challengeId: id, userId } } });
        saved = false;
      } else {
        await req.prisma.challengeBookmark.create({ data: { challengeId: id, userId } });
        saved = true;
      }

      return reply.send({ saved });
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: "Failed to toggle bookmark" });
    }
  });

  // GET /challenges/:id/interactions — get like count + user's like/bookmark state
  fastify.get("/challenges/:id/interactions", async (req: FastifyRequest, reply) => {
    const { id } = req.params as { id: string };
    let userId: string | undefined;
    try { await req.jwtVerify(); userId = (req.user as { sub: string }).sub; } catch {}

    const likes = await req.prisma.challengeLike.count({ where: { challengeId: id } });
    let liked = false;
    let saved = false;
    if (userId) {
      const [likeRow, bookmarkRow] = await Promise.all([
        req.prisma.challengeLike.findUnique({ where: { challengeId_userId: { challengeId: id, userId } } }),
        req.prisma.challengeBookmark.findUnique({ where: { challengeId_userId: { challengeId: id, userId } } }),
      ]);
      liked = !!likeRow;
      saved = !!bookmarkRow;
    }
    return reply.send({ likes, liked, saved });
  });

  // ── User Social Graph ───────────────────────────────────────────────────────

  // POST /users/:id/follow — toggle follow, returns { following, followers }
  fastify.post("/users/:id/follow", { preHandler: [fastify.authenticate] }, async (req: FastifyRequest, reply) => {
    const { id: followedId } = req.params as { id: string };
    const followerId = (req.user as { sub: string }).sub;

    if (followerId === followedId) {
      return reply.code(400).send({ error: "Cannot follow yourself" });
    }

    try {
      const target = await req.prisma.user.findUnique({ where: { id: followedId } });
      if (!target) return reply.code(404).send({ error: "User not found" });

      const existing = await req.prisma.userFollow.findUnique({
        where: { followerId_followedId: { followerId, followedId } },
      });

      let isFollowing: boolean;
      if (existing) {
        await req.prisma.userFollow.delete({ where: { followerId_followedId: { followerId, followedId } } });
        isFollowing = false;
      } else {
        await req.prisma.userFollow.create({ data: { followerId, followedId } });
        isFollowing = true;
      }

      const [followingCount, followersCount] = await Promise.all([
        req.prisma.userFollow.count({ where: { followerId: followedId } }),
        req.prisma.userFollow.count({ where: { followedId } }),
      ]);

      return reply.send({ following: isFollowing, followingCount, followersCount });
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: "Failed to toggle follow" });
    }
  });

  // GET /users/:username/profile — public profile page data
  fastify.get("/users/:username/profile", async (req: FastifyRequest, reply) => {
    const { username } = req.params as { username: string };
    let viewerId: string | undefined;
    try { await req.jwtVerify(); viewerId = (req.user as { sub: string }).sub; } catch {}

    const user = await req.prisma.user.findFirst({
      where: {
        OR: [{ username }, { id: username }],
        isPublic: true,
      },
      select: {
        id: true,
        name: true,
        username: true,
        avatarUrl: true,
        bio: true,
        location: true,
        websiteUrl: true,
        jobTitle: true,
        xp: true,
        currentStreak: true,
        longestStreak: true,
        createdAt: true,
        _count: {
          select: {
            following: true,
            followers: true,
            challengeLikes: true,
          },
        },
        badges: {
          include: { badge: true },
          take: 10,
          orderBy: { earnedAt: "desc" },
        },
        sessions: {
          where: { status: "COMPLETED" },
          select: {
            challengeId: true,
            challenge: { select: { id: true, title: true, difficulty: true, category: true, xp: true } },
            endedAt: true,
          },
          orderBy: { endedAt: "desc" },
          take: 20,
        },
        articleLikes: {
          select: { article: { select: { id: true, slug: true, title: true, category: true } } },
          take: 5,
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!user) return reply.code(404).send({ error: "Profile not found or private" });

    // Check if viewer follows this user
    let isFollowing = false;
    if (viewerId && viewerId !== user.id) {
      const followRow = await req.prisma.userFollow.findUnique({
        where: { followerId_followedId: { followerId: viewerId, followedId: user.id } },
      });
      isFollowing = !!followRow;
    }

    // Deduplicate completed challenges
    const completedMap = new Map<string, typeof user.sessions[number]>();
    for (const s of user.sessions) {
      if (!completedMap.has(s.challengeId)) completedMap.set(s.challengeId, s);
    }

    return reply.send({
      ...user,
      followersCount: user._count.followers,
      followingCount: user._count.following,
      completedChallenges: Array.from(completedMap.values()).map(s => s.challenge),
      isFollowing,
    });
  });

  // GET /users/me/bookmarks — logged-in user's saved challenges
  fastify.get("/users/me/bookmarks", { preHandler: [fastify.authenticate] }, async (req: FastifyRequest, reply) => {
    const userId = (req.user as { sub: string }).sub;
    const bookmarks = await req.prisma.challengeBookmark.findMany({
      where: { userId },
      include: {
        challenge: {
          select: { id: true, title: true, difficulty: true, category: true, tags: true, xp: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return reply.send(bookmarks.map(b => b.challenge));
  });

  // GET /users/me/following — list users I follow
  fastify.get("/users/me/following", { preHandler: [fastify.authenticate] }, async (req: FastifyRequest, reply) => {
    const userId = (req.user as { sub: string }).sub;
    const rows = await req.prisma.userFollow.findMany({
      where: { followerId: userId },
      include: {
        followed: { select: { id: true, name: true, username: true, avatarUrl: true, jobTitle: true, xp: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return reply.send(rows.map(r => r.followed));
  });

  // GET /users/me/feed — chronological social activity feed of followed users
  fastify.get("/users/me/feed", { preHandler: [fastify.authenticate] }, async (req: FastifyRequest, reply) => {
    const userId = (req.user as { sub: string }).sub;
    const { limit = "20" } = req.query as { limit?: string };
    const takeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);

    // 1. Get IDs of followed users
    const following = await req.prisma.userFollow.findMany({
      where: { followerId: userId },
      select: { followedId: true },
    });

    const followedIds = following.map((f) => f.followedId);

    if (followedIds.length === 0) {
      return reply.send({ feed: [] });
    }

    // 2. Fetch completions and submissions from followed users
    const [completions, badges] = await Promise.all([
      req.prisma.labSession.findMany({
        where: {
          userId: { in: followedIds },
          status: "COMPLETED",
        },
        include: {
          user: { select: { id: true, name: true, username: true, avatarUrl: true, jobTitle: true } },
          challenge: { select: { id: true, title: true, difficulty: true, category: true, xp: true } },
        },
        orderBy: { endedAt: "desc" },
        take: takeLimit,
      }),
      req.prisma.userBadge.findMany({
        where: {
          userId: { in: followedIds },
        },
        include: {
          user: { select: { id: true, name: true, username: true, avatarUrl: true, jobTitle: true } },
          badge: { select: { id: true, title: true, description: true, iconRef: true } },
        },
        orderBy: { earnedAt: "desc" },
        take: takeLimit,
      }),
    ]);

    // 3. Unify and sort chronologically
    const feedItems = [
      ...completions.map((c) => ({
        id: `completion-${c.id}`,
        type: "CHALLENGE_SOLVED" as const,
        user: c.user,
        challenge: c.challenge,
        timestamp: c.endedAt || c.startedAt,
      })),
      ...badges.map((b) => ({
        id: `badge-${b.userId}-${b.badgeId}`,
        type: "BADGE_EARNED" as const,
        user: b.user,
        badge: b.badge,
        timestamp: b.earnedAt,
      })),
    ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, takeLimit);

    return reply.send({ feed: feedItems });
  });

  // GET /users/discover — minimal user discovery community list
  fastify.get("/users/discover", async (req: FastifyRequest, reply) => {
    const { q, limit = "20" } = req.query as { q?: string; limit?: string };
    const takeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);

    // Extract optional viewer with cryptographic signature verification
    let viewerId: string | null = null;
    try {
      await req.jwtVerify();
      const user = req.user as { sub?: string; id?: string } | undefined;
      viewerId = user?.sub || user?.id || null;
    } catch {
      // Unauthenticated / guest viewer is allowed
    }

    const where: any = { isPublic: true };
    if (q && q.trim()) {
      where.OR = [
        { name: { contains: q.trim(), mode: "insensitive" } },
        { username: { contains: q.trim(), mode: "insensitive" } },
        { jobTitle: { contains: q.trim(), mode: "insensitive" } },
      ];
    }

    const users = await req.prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        username: true,
        avatarUrl: true,
        jobTitle: true,
        xp: true,
        currentStreak: true,
        longestStreak: true,
        badges: {
          take: 1,
          orderBy: { earnedAt: "desc" },
          include: { badge: true },
        },
        _count: {
          select: {
            followers: true,
          },
        },
      },
      orderBy: [{ currentStreak: "desc" }, { xp: "desc" }],
      take: takeLimit,
    });

    // Check which users viewer is following
    let followingSet = new Set<string>();
    if (viewerId) {
      const viewerFollows = await req.prisma.userFollow.findMany({
        where: { followerId: viewerId },
        select: { followedId: true },
      });
      followingSet = new Set(viewerFollows.map((f) => f.followedId));
    }

    const results = users.map((u) => ({
      id: u.id,
      name: u.name,
      username: u.username,
      avatarUrl: u.avatarUrl,
      jobTitle: u.jobTitle,
      xp: u.xp,
      currentStreak: u.currentStreak,
      longestStreak: u.longestStreak,
      followersCount: u._count.followers,
      topBadge: u.badges[0]?.badge || null,
      isFollowing: viewerId ? followingSet.has(u.id) : false,
      isSelf: viewerId === u.id,
    }));

    return reply.send({ users: results });
  });
}

