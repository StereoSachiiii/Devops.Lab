import { PrismaClient } from '@devops/db';

/** Shared PrismaClient — single connection pool for the entire auth service. */
export const prisma = new PrismaClient();
