import "./env";
import { initObservability, requireEnv } from "@devops/observability";
import { buildApp } from "./app";

const SERVICE_NAME = "core-service";
const { loggerOptions, stream, logger, shutdown } = initObservability(SERVICE_NAME);

const PORT = parseInt(requireEnv("CORE_SERVICE_PORT"), 10);

async function main() {
  const app = await buildApp({
    loggerOptions,
    stream,
    logger,
    shutdown,
    jwtPublicKey: requireEnv("JWT_PUBLIC_KEY").replace(/\\n/g, "\n"),
    sessionTTLMins: parseInt(requireEnv("SESSION_TTL_MINS"), 10),
  });

  try {
    await app.listen({ port: PORT, host: "0.0.0.0" });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

process.on("SIGTERM", () => shutdown());
process.on("SIGINT", () => shutdown());

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
