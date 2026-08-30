import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env"), override: false });
dotenv.config({ path: path.resolve(__dirname, ".env"), override: false });

process.env["NODE_ENV"] = "test";
process.env["REDIS_URL"] = process.env["REDIS_URL"] || "redis://127.0.0.1:6379";
process.env["CORE_SERVICE_PORT"] = process.env["CORE_SERVICE_PORT"] || "3003";
process.env["SESSION_TTL_MINS"] = process.env["SESSION_TTL_MINS"] || "60";
