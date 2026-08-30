import fp from "fastify-plugin";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createTenantClient } from "@devops/db";
import type { PrismaClient } from "@devops/db";

declare module "fastify" {
  interface FastifyRequest {
    prisma: PrismaClient;
  }
}

export const tenantPrismaPlugin = fp(async (fastify: FastifyInstance) => {
  fastify.addHook("onRequest", async (request: FastifyRequest, _reply: FastifyReply) => {
    // Attempt to decode the JWT manually since jwtVerify hasn't necessarily run yet,
    // or just rely on the fact that some routes do jwtVerify in onRequest.
    // Actually, onRequest runs very early. If routes run jwtVerify in their own onRequest array,
    // they run AFTER global onRequest hooks.
    // If request.user is set (by preValidation or manual verification), we can use it.
    // To be safe, we dynamically create a getter on the request so the tenant client
    // is instantiated only when accessed, by which point the user might be authenticated.

    let _tenantClient: PrismaClient | null = null;
    let _cachedOrgId: string | undefined | null = null;
    let _cachedUserId: string | undefined | null = null;

    Object.defineProperty(request, "prisma", {
      get() {
        const orgId = request.user?.orgId;
        const userId = request.user?.sub || request.user?.id; // depending on token payload
        
        // Re-create client if orgId or userId changed since last access
        if (_tenantClient && orgId === _cachedOrgId && userId === _cachedUserId) return _tenantClient;
        
        _tenantClient = createTenantClient(fastify.prisma, orgId, userId) as PrismaClient;
        _cachedOrgId = orgId;
        _cachedUserId = userId;
        return _tenantClient;
      },
    });
  });
});
