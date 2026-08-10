import "./env";

import { initObservability } from "@devops/observability";
import { buildApp } from "./app";

const obs = initObservability("auth-service");
import { requireEnv } from "@devops/observability";

const port = Number(requireEnv("AUTH_SERVICE_PORT"));

async function start(): Promise<void> {
  const fastify = buildApp(obs);

  try {
    await fastify.listen({ port, host: "0.0.0.0" });
    fastify.log.info({ port }, "Auth service listening");
  } catch (err) {
    fastify.log.error(err, "Failed to start auth service");
    process.exit(1);
  }
}

start().catch((err) => {
  console.error("Unhandled top-level error:", err);
  process.exit(1);
});
