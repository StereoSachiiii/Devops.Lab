import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import type { ObservabilityConfig } from "@devops/observability";
import type { OAuth2Namespace } from "@fastify/oauth2";
import pino from "pino";

import { jwtPlugin } from "./plugins/jwt";
import { oauth2Plugin } from "./plugins/oauth2";
import { requireEnv } from "@devops/observability";
import { kafkaPlugin } from "./plugins/kafka";
import { redisPlugin } from "./plugins/redis";
import { outboxPlugin } from "./plugins/outbox";
import { metricsPlugin } from "./plugins/metrics";

import { tenantPrismaPlugin } from "./plugins/tenant-prisma.js";
import { prisma } from "./utils/db";
import { registerHealthChecks } from "./utils/health";

import { accountRoutes } from "./routes/account";
import { mfaRoutes } from "./routes/mfa";
import { oauthRoutes } from "./routes/oauth";

declare module "fastify" {
  interface FastifyInstance {
    github: OAuth2Namespace;
    google: OAuth2Namespace;
  }
}

export function buildApp(obs: ObservabilityConfig) {
  const isTest = requireEnv("NODE_ENV") === "test";

  const fastify = Fastify({
    ...(isTest ? { logger: false } : { logger: pino(obs.loggerOptions, obs.stream as pino.DestinationStream) }),
    requestIdHeader: "x-request-id",
    requestIdLogLabel: "request_id",
    genReqId: (req) => (req.headers["x-request-id"] as string) ?? crypto.randomUUID(),
  }).withTypeProvider<TypeBoxTypeProvider>();

  const corsOrigins = requireEnv("CORS_ORIGIN")
    .split(",")
    .map((o) => o.trim());

  fastify.register(cors, { origin: corsOrigins, credentials: true });

  fastify.register(jwtPlugin);

  fastify.register(tenantPrismaPlugin);
  fastify.register(oauth2Plugin);
  fastify.register(kafkaPlugin);
  fastify.register(redisPlugin);
  fastify.register(outboxPlugin);
  fastify.register(metricsPlugin);

  registerHealthChecks(fastify as unknown as FastifyInstance, prisma);

  fastify.register(accountRoutes);
  fastify.register(mfaRoutes);
  fastify.register(oauthRoutes);

  fastify.setErrorHandler(function (error, request, reply) {
    console.error("APP ERROR DEBUG:", error);
    try {
      this.log.error({ err: error, method: request.method, url: request.url }, "Unhandled error");
      console.error("APP_TS_500_ERROR:", error);
    } catch {}

    const status = error.statusCode ?? 500;

    if (status >= 400 && status < 500) {
      return reply.send(error);
    }

    return reply.status(status).send({
      statusCode: status,
      error: status === 503 ? "Service Unavailable" : "Internal Server Error",
      message: "An unexpected error occurred. Please try again later.",
    });
  });

  return fastify;
}
