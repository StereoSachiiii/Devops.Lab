// packages/observability/index.ts

import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { Resource } from "@opentelemetry/resources";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import { trace, context } from "@opentelemetry/api";
import pino, { Logger, MultiStreamRes } from "pino";
import fs from "fs";

export function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return val;
}

function resolveLogPath(serviceName: string): string {
  const envDir = process.env["LOG_DIR"] || "./logs";
  try {
    if (!fs.existsSync(envDir)) fs.mkdirSync(envDir, { recursive: true });
    fs.accessSync(envDir, fs.constants.W_OK);
    return `${envDir}/${serviceName}.log`;
  } catch {
    const localDir = "./logs";
    if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true });
    return `${localDir}/${serviceName}.log`;
  }
}

// What initObservability returns — pass loggerOptions and stream
// directly into Fastify({ logger: loggerOptions, stream })
export interface ObservabilityConfig {
  loggerOptions: pino.LoggerOptions;
  stream: MultiStreamRes;
  logger: pino.Logger;
  shutdown: () => void;
}

export function initObservability(serviceName: string): ObservabilityConfig {
  const streams: Array<{ stream: any }> = [
    { stream: process.stdout },
    {
      stream: pino.destination({
        dest: resolveLogPath(serviceName),
        sync: true,
        mkdir: true,
      }),
    },
  ];

  const loggerOptions: pino.LoggerOptions = {
    level: requireEnv("LOG_LEVEL"),
    base: { service: serviceName },
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "res.headers.set-cookie",
        "password",
        "body.password",
      ],
      remove: true,
    },
    mixin() {
      try {
        const span = trace.getSpan(context.active());
        if (span) {
          const ctx = span.spanContext();
          return { trace_id: ctx.traceId, span_id: ctx.spanId };
        }
      } catch { }
      return {};
    },
  };

  const lokiUrl = requireEnv("LOKI_URL");
  const logFilePath = resolveLogPath(serviceName);
  let stream: any;

  if (lokiUrl) {
    try {
      const maybeUrl = new URL(lokiUrl);
      const lokiHost = maybeUrl.pathname.includes("/loki/api/v1/push") ? maybeUrl.origin : lokiUrl;
      const targetPath = require.resolve("pino-loki");

      stream = pino.transport({
        targets: [
          {
            target: "pino/file",
            options: { destination: 1 }, // stdout
          },
          {
            target: "pino/file",
            options: { destination: logFilePath, mkdir: true }, // local file logs/
          },
          {
            target: targetPath,
            options: {
              host: lokiHost,
              batching: false,
              labels: { service: serviceName, env: requireEnv("NODE_ENV") },
              silenceErrors: false,
              timeout: 3000,
            },
          },
        ],
      });
    } catch (err) {
      console.warn("Failed to initialize Loki transport targets", err);
      stream = pino.multistream(streams);
    }
  } else {
    stream = pino.multistream(streams);
  }

  const otelEndpoint = requireEnv("OTEL_TRACES_ENDPOINT");
  const traceExporter = new OTLPTraceExporter({ url: otelEndpoint });

  const sdk = new NodeSDK({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: requireEnv("NODE_ENV"),
      "service.version": requireEnv("SERVICE_VERSION"),
    }),
    traceExporter,
    instrumentations: [getNodeAutoInstrumentations()],
  });

  sdk.start();

  const shutdown = () => {
    sdk
      .shutdown()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  const logger = pino(loggerOptions, stream);

  return { loggerOptions, stream, logger, shutdown };
}

// Re-export so services don't need their own @opentelemetry/api dependency
export { trace } from "@opentelemetry/api";
export type { Logger };

// Metrics (prom-client)
export {
  createRegistry,
  createHttpRequestDuration,
  createAuthLoginCounter,
  createAuthRegisterCounter,
  createAuthLoginDuration,
  createMetricsHook,
} from "./metrics";
export type { Registry, Counter, Histogram } from "prom-client";
