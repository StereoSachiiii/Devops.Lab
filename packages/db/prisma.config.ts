import { defineConfig } from "@prisma/config";
import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
export default defineConfig({
  earlyAccess: true,
  datasource: {
    url: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/appdb?schema=public",
  },
  studio: {
    directUrl: process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/appdb?schema=public",
  },
  migrate: {
    url: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/appdb?schema=public",
    directUrl: process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/appdb?schema=public",
  },
  migrations: {
    seed: "ts-node ./prisma/seed.ts",
  },
});
