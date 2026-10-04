import { PrismaClient, createBypassClient } from "@devops/db";

import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

import { requireEnv } from "@devops/observability";

const connectionString = requireEnv("DATABASE_URL");
const pool = new Pool({ 
  connectionString,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});
const adapter = new PrismaPg(pool);
const basePrisma = new PrismaClient({ adapter });

/** Shared PrismaClient — trusted bypass client for system/auth authentication and session management. */
export const prisma = createBypassClient(basePrisma);
