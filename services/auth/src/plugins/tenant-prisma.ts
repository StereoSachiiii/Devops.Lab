import fp from "fastify-plugin";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createTenantClient } from "@devops/db";
import type { PrismaClient } from "@devops/db";
import { prisma as fallbackPrisma } from "../utils/db";

declare module "fastify" {
  interface FastifyRequest {
    prisma: PrismaClient;
  }
}

export const tenantPrismaPlugin = fp(async (fastify: FastifyInstance) => {
  fastify.addHook("onRequest", async (request: FastifyRequest, _reply: FastifyReply) => {
    // AUTH-007 FIX: Track the orgId that was used to create the cached client.
    // If orgId changes (e.g. after JWT verification), invalidate and re-create.
    let _tenantClient: PrismaClient | null = null;
    let _cachedOrgId: string | undefined | null = null;
    let _cachedUserId: string | undefined | null = null;

    Object.defineProperty(request, "prisma", {
      get() {
        const orgId = request.user?.orgId;
        const userId = request.user?.sub || request.user?.id;
        
        // Re-create client if orgId or userId changed since last access
        if (_tenantClient && orgId === _cachedOrgId && userId === _cachedUserId) return _tenantClient;
        
        const baseClient = (fastify as { prisma?: PrismaClient }).prisma || fallbackPrisma;
        _tenantClient = createTenantClient(baseClient, orgId, userId) as PrismaClient;
        _cachedOrgId = orgId;
        _cachedUserId = userId;
        return _tenantClient;
      },
    });
  });
});
