import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => {
      return { level: label.toUpperCase() };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export const initObservability = (serviceName: string) => {
  const sdk = new NodeSDK({
    serviceName,
    instrumentations: [getNodeAutoInstrumentations()],
  });

  sdk.start();

  logger.info({ serviceName }, 'Observability initialized');

  process.on('SIGTERM', () => {
    sdk.shutdown()
      .then(() => logger.info('Observability shut down'))
      .catch((err) => logger.error(err, 'Error shutting down observability'))
      .finally(() => process.exit(0));
  });
};
