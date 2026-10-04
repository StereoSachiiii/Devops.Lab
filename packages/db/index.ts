export * from "@prisma/client";
export { PrismaClient } from "@prisma/client";

import { PrismaClient } from "@prisma/client";

export function createTenantClient(baseClient: PrismaClient, orgId?: string, userId?: string): PrismaClient {
  const oId = orgId || '';
  const uId = userId || '';
  
  return baseClient.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args }) {
          // set_config(..., true) is transaction-local, so it must run in the SAME
          // transaction/connection as the query. A batch $transaction guarantees that.
          const delegate = (baseClient as any)[model.charAt(0).toLowerCase() + model.slice(1)];
          const [, result] = await baseClient.$transaction([
            baseClient.$executeRaw`SELECT set_config('app.current_org_id', ${oId}, true), set_config('app.current_user_id', ${uId}, true), set_config('app.bypass_rls', '', true)`,
            delegate[operation](args),
          ]);
          return result;
        },
      },
    },
  }) as unknown as PrismaClient;
}

/**
 * Trusted-code-only client: sets app.bypass_rls='true' for each operation so FORCE RLS
 * policies allow it. Use for seed, outbox consumers, reapers and pre-auth flows
 * (login/register). Do NOT use it for request-scoped, user-driven queries.
 */
export function createBypassClient(baseClient: PrismaClient): PrismaClient {
  return baseClient.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args }) {
          const delegate = (baseClient as any)[model.charAt(0).toLowerCase() + model.slice(1)];
          const [, result] = await baseClient.$transaction([
            baseClient.$executeRaw`SELECT set_config('app.bypass_rls', 'true', true)`,
            delegate[operation](args),
          ]);
          return result;
        },
      },
    },
  }) as unknown as PrismaClient;
}
