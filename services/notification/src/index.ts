import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
import { buildApp } from "./app";
import { requireEnv, initObservability } from "@devops/observability";

async function start() {
  const obs = initObservability("notification-service");
  const app = await buildApp(obs);

  try {
    const port = parseInt(requireEnv("NOTIFICATION_SERVICE_PORT"), 10);
    await app.listen({ port, host: "0.0.0.0" });
    console.log(`Notification service listening on port ${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
