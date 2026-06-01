// packages/observability/index.ts

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import pino, { Logger, MultiStreamRes } from 'pino';
import fs from 'fs';

const LOG_DIR = process.env.LOG_DIR ?? '/var/log/services';

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
  const stream = pino.multistream([
    { stream: process.stdout },
    {
      stream: pino.destination({
        dest: resolveLogPath(serviceName),
        sync: false,
      }),
    },
  ]);

  const loggerOptions: pino.LoggerOptions = {
    level: process.env.LOG_LEVEL ?? 'info',
    base: { service: serviceName },
    formatters: {
      level: (label) => ({ level: label.toUpperCase() }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  const sdk = new NodeSDK({
    serviceName,
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

// Re-export pino type so services don't need to import pino directly
export type { Logger };
