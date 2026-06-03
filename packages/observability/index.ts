// packages/observability/index.ts

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { trace, context } from '@opentelemetry/api';
import pino, { Logger, MultiStreamRes } from 'pino';
import fs from 'fs';
import pinoLoki from 'pino-loki';

const LOG_DIR = process.env['LOG_DIR'] ?? '/var/log/services';

function resolveLogPath(serviceName: string): string {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.accessSync(LOG_DIR, fs.constants.W_OK);
    return `${LOG_DIR}/${serviceName}.log`;
  } catch {
    const fallback = `${process.cwd()}/logs`;
    fs.mkdirSync(fallback, { recursive: true });
    return `${fallback}/${serviceName}.log`;
  }
}

// What initObservability returns — pass loggerOptions and stream
// directly into Fastify({ logger: loggerOptions, stream })
export interface ObservabilityConfig {
  loggerOptions: pino.LoggerOptions;
  stream: MultiStreamRes;
  shutdown: () => void;
}

export function initObservability(serviceName: string): ObservabilityConfig {
  const streams: Array<{ stream: any }> = [
    { stream: process.stdout },
    {
      stream: pino.destination({
        dest: resolveLogPath(serviceName),
        sync: false,
      }),
    },
  ];

  // Optionally ship logs to Grafana Loki when LOKI_URL is provided.
  // We do this via pino transport (supported API), not by trying to treat
  // pino-loki as a raw stream.
  const lokiUrl = process.env['LOKI_URL'];
  let lokiTransport: any | undefined;
  if (lokiUrl) {
    try {
      const lokiUser = process.env['LOKI_USER'];
      const lokiPass = process.env['LOKI_PASS'];
      // `pino-loki` expects `host` to be the base Loki URL (e.g. http://localhost:3100).
      // Some configs (including this repo's `.env`) may incorrectly provide the full push
      // endpoint (`.../loki/api/v1/push`). Handle both to make log shipping reliable.
      const maybeUrl = new URL(lokiUrl);
      const lokiHost =
        maybeUrl.pathname.includes("/loki/api/v1/push") ? maybeUrl.origin : lokiUrl;

      lokiTransport = pino.transport({
        target: "pino-loki",
        options: {
          host: lokiHost,
          batching: true,
          interval: 5,
          labels: { service: serviceName, env: process.env['NODE_ENV'] || "development" },
          basicAuth:
            lokiUser && lokiPass
              ? {
                  username: lokiUser,
                  password: lokiPass,
                }
              : undefined,
        },
      } as any);
    } catch (err) {
      // don't fail startup if Loki integration is misconfigured
      // eslint-disable-next-line no-console
      console.warn("Failed to initialize Loki transport", err);
    }
  }

  const stream = pino.multistream(streams);

  const loggerOptions: pino.LoggerOptions = {
    level: process.env['LOG_LEVEL'] ?? 'info',
    base: { service: serviceName },
    ...(lokiTransport ? { transport: lokiTransport } : {}),
    formatters: {
      level: (label) => ({ level: label.toUpperCase() }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    // Redact sensitive fields from logs
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers.set-cookie', 'password', 'body.password'],
      remove: true,
    },
    // Mixin active trace/span IDs into each log record
    mixin() {
      try {
        const span = trace.getSpan(context.active());
        if (span) {
          const ctx = span.spanContext();
          return { trace_id: ctx.traceId, span_id: ctx.spanId };
        }
      } catch (_) {}
      return {};
    },
  };

  const otelEndpoint = process.env['OTEL_TRACES_ENDPOINT'] || 'http://otel-collector:4318/v1/traces';
  const traceExporter = new OTLPTraceExporter({ url: otelEndpoint });

  const sdk = new NodeSDK({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env['NODE_ENV'] || 'development',
      'service.version': process.env['SERVICE_VERSION'] || '0.0.0',
    }),
    traceExporter,
    instrumentations: [getNodeAutoInstrumentations()],
  });

  sdk.start();

  const shutdown = () => {
    sdk.shutdown()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  return { loggerOptions, stream, shutdown };
}

// Re-export so services don't need their own @opentelemetry/api dependency
export { trace } from '@opentelemetry/api';
export type { Logger };

// Metrics (prom-client)
export {
  createRegistry,
  createHttpRequestDuration,
  createAuthLoginCounter,
  createAuthRegisterCounter,
  createAuthLoginDuration,
  createMetricsHook,
} from './metrics';
export type { Registry, Counter, Histogram } from 'prom-client';
