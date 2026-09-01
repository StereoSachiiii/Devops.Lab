export * from "@prisma/client";
export { PrismaClient } from "@prisma/client";

import { PrismaClient } from "@prisma/client";

export function createTenantClient(baseClient: PrismaClient, orgId?: string, userId?: string) {
  if (!orgId && !userId) {
    return baseClient;
  }
  const oId = orgId || '';
  const uId = userId || '';
  
  return baseClient.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          const [, result] = await baseClient.$transaction([
            baseClient.$executeRaw`SELECT set_config('app.current_org_id', ${oId}, true), set_config('app.current_user_id', ${uId}, true)`,
            query(args),
          ]);
          return result;
        },
      },
    },
  });
}
