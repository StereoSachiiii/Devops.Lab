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

  const shutdown = () => {
    sdk.shutdown()
      .then(() => logger.info('Observability shut down'))
      .catch((err) => logger.error(err, 'Error shutting down observability'))
      .finally(() => process.exit(0));
  };

  // SIGTERM is sent by Docker/Kubernetes when stopping a container
  process.on('SIGTERM', shutdown);
  // SIGINT is sent when you press Ctrl+C in your Windows/Mac/Linux terminal
  process.on('SIGINT', shutdown);
};
