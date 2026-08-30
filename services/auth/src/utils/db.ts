import { PrismaClient } from "@devops/db";

import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env['DATABASE_URL'];
const pool = new Pool({ 
  connectionString,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});
const adapter = new PrismaPg(pool);

/** Shared PrismaClient — single connection pool for the entire auth service. */
export const prisma = new PrismaClient({ adapter });
