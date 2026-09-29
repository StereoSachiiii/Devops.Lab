import { defineConfig } from "@prisma/config";
import dotenv from "dotenv";
import path from "path";
if (!process.env.DATABASE_URL) {
  dotenv.config({ path: path.resolve(__dirname, "../../.env") });
}
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  throw new Error("Missing required environment variable: DATABASE_URL");
}
export default defineConfig({
  earlyAccess: true,
  datasource: {
    url: dbUrl,
  },
  studio: {
    directUrl: process.env.DATABASE_DIRECT_URL || dbUrl,
  },
  migrate: {
    url: dbUrl,
    directUrl: process.env.DATABASE_DIRECT_URL || dbUrl,
  },
  migrations: {
    seed: "ts-node ./prisma/seed.ts",
  },
});
