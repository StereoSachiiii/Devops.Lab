import Fastify, { FastifyRequest, FastifyReply, FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import cookie from "@fastify/cookie";
import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { PrismaClient } from "@devops/db";
import { MessagingService, RabbitMQService } from "@devops/messaging";
import type { ObservabilityConfig } from "@devops/observability";
import { requireEnv } from "@devops/observability";
import Redis from "ioredis";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import "./types";

import { nodeRoutes } from "./modules/content/node.routes";
import { quizRoutes } from "./modules/content/quiz.routes";
import { roadmapRoutes } from "./modules/content/roadmap.routes";
import { articleRoutes } from "./modules/content/article.routes";
import { challengeRoutes } from "./modules/challenge/challenge.routes";
import { assistantRoutes } from "./modules/assistant/assistant.routes";
import { leaderboardRoutes } from "./modules/user/leaderboard.routes";
import { dashboardRoutes } from "./modules/user/dashboard.routes";
import { orgRoutes } from "./modules/org/org.routes";
import { shareRoutes } from "./modules/social/share.routes";
import { commentRoutes } from "./modules/social/comment.routes";
import { challengeListRoutes } from "./modules/content/list.routes";
import { registerProgressConsumers } from "./modules/progress/consumers";
import { registerHealthChecks } from "./utils/health";
import { metricsPlugin } from "./plugins/metrics";
import { tenantPrismaPlugin } from "./plugins/tenant-prisma";
import { startOutboxPoller } from "./plugins/outbox-poller";
import { startSessionReaper } from "./plugins/session-reaper";

export interface AppOptions extends ObservabilityConfig {
  jwtPublicKey: string;
  sessionTTLMins: number;
}

export async function buildApp(opts: AppOptions) {
  const app = Fastify({
    logger: opts.logger,
  }).withTypeProvider<TypeBoxTypeProvider>();

  // Custom lazy Redis registration to prevent startup timeouts
  const redis = new Redis(requireEnv("REDIS_URL"), {
    lazyConnect: true,
    enableOfflineQueue: true,
    maxRetriesPerRequest: null,
    retryStrategy: (times: number) => Math.min(times * 100, 3000),
  });
  redis.on("connect", () => app.log.info("Redis connected"));
  redis.on("error", (err: Error) => app.log.warn({ err: err.message }, "Redis connection issue"));
  app.decorate("redis", redis);
  redis.connect().catch((err: Error) => {
    app.log.error({ err: err.message }, "Redis background connection failed");
  });
  app.addHook("onClose", async () => {
    await redis.quit();
  });

  app.addHook("onRequest", async (_req, reply) => {
    reply.header("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0");
    reply.header("Pragma", "no-cache");
    reply.header("Expires", "0");
  });

  await app.register(cors, { origin: true });

  // Public key only — core verifies tokens, never signs
  await app.register(cookie);
  await app.register(jwt, {
    secret: {
      private: "",
      public: opts.jwtPublicKey,
    },
    verify: { algorithms: ["RS256"] },
    cookie: { cookieName: "token", signed: false },
  });

  const connectionString = process.env['DATABASE_URL'];
  const pool = new pg.Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
  app.decorate("prisma", prisma);

  app.register(tenantPrismaPlugin);

  const kafka = new MessagingService("core-service");
  app.decorate("kafka", kafka);

  const rabbitmq = new RabbitMQService();
  app.decorate("rabbitmq", rabbitmq);

  app.decorate("sessionTTLMins", opts.sessionTTLMins);

  await app.register(metricsPlugin);

  app.decorate("authenticate", async function (request: FastifyRequest, reply: FastifyReply) {
    try {
      await request.jwtVerify();
      const jti = (request.user as { jti?: string })?.jti;
      if (jti && redis) {
        const isDenylisted = await redis.get(`auth:denylist:jti:${jti}`);
        if (isDenylisted === "revoked") {
          return reply.code(401).send({ statusCode: 401, error: "Unauthorized", message: "Token has been revoked" });
        }
      }
    } catch (err) {
      app.log.warn({ err }, "Unauthorized access attempt");
      return reply.code(401).send({ error: "Unauthorized" });
    }
  });

  // Dual-registered for Kong (strip_path=true at root) and direct access (/api/content)
  await app.register(nodeRoutes);
  await app.register(nodeRoutes, { prefix: "/api/content" });

  await app.register(quizRoutes);
  await app.register(quizRoutes, { prefix: "/api/content" });
  await app.register(quizRoutes, { prefix: "/api" });
  
  await app.register(roadmapRoutes);
  await app.register(roadmapRoutes, { prefix: "/api/content" });

  await app.register(articleRoutes);
  await app.register(articleRoutes, { prefix: "/api/content" });
  await app.register(articleRoutes, { prefix: "/api" });

  // Kong uses strip_path=false, so routes include /api prefix
  await app.register(challengeRoutes, { prefix: "/api" });
  await app.register(assistantRoutes, { prefix: "/api" });
  await app.register(leaderboardRoutes, { prefix: "/api" });
  await app.register(dashboardRoutes, { prefix: "/api" });
  await app.register(orgRoutes, { prefix: "/api" });
  await app.register(shareRoutes);
  await app.register(shareRoutes, { prefix: "/api" });
  await app.register(commentRoutes);
  await app.register(commentRoutes, { prefix: "/api" });
  await app.register(challengeListRoutes);
  await app.register(challengeListRoutes, { prefix: "/api" });


  registerHealthChecks(app as unknown as FastifyInstance, prisma, kafka);

  let poller: NodeJS.Timeout | undefined;
  let reaper: NodeJS.Timeout | undefined;

  app.addHook("onReady", async () => {
    poller = startOutboxPoller(app as unknown as FastifyInstance);
    reaper = startSessionReaper(app as unknown as FastifyInstance);

    prisma
      .$connect()
      .then(() => app.log.info("Connected to Database"))
      .catch((err: Error) => app.log.error({ err: err.message }, "Database connection failed"));

    rabbitmq
      .init()
      .then(() => app.log.info("RabbitMQ initialized"))
      .catch((err: Error) => app.log.error({ err: err.message }, "RabbitMQ initialization failed"));

    kafka
      .initProducer()
      .then(async () => {
        app.log.info("Kafka producer initialized");
        await registerProgressConsumers(app as unknown as FastifyInstance);
      })
      .catch((err: Error) => app.log.error({ err: err.message }, "Kafka initialization failed"));
  });

  app.setErrorHandler(function (error, request, reply) {
    try {
      this.log.error({ err: error, method: request.method, url: request.url }, "Unhandled error");
    } catch { }
    reply.send(error);
  });

  app.addHook("onClose", async () => {
    if (poller) {
      clearInterval(poller);
    }
    if (reaper) {
      clearInterval(reaper);
    }
    await prisma.$disconnect();
    await kafka.disconnect();
    await rabbitmq.disconnect();
  });

  return app;
}
