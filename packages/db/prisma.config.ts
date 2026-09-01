import { defineConfig } from "@prisma/config";
import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
export default defineConfig({
  earlyAccess: true,
  datasource: {
    url: process.env.DATABASE_URL,
  },
  studio: {
    directUrl: process.env.DATABASE_DIRECT_URL,
  },
  migrate: {
    url: process.env.DATABASE_URL,
    directUrl: process.env.DATABASE_DIRECT_URL,
  },
  migrations: {
    seed: "ts-node ./prisma/seed.ts",
  },
});
