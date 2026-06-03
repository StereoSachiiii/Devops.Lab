import dotenv from 'dotenv';
import path from 'path';

// Load env BEFORE anything else — initObservability reads LOKI_URL, LOG_LEVEL, etc.
dotenv.config({ path: path.resolve(__dirname, '../../../.env'), override: false });
dotenv.config({ path: path.resolve(__dirname, '../.env'),        override: false });

import { initObservability } from '@devops/observability';
import { buildApp } from './app';

const obs  = initObservability('auth-service');
const port = Number(process.env['PORT']) || 3002;

async function start(): Promise<void> {
  const fastify = buildApp(obs);

  try {
    await fastify.listen({ port, host: '0.0.0.0' });
    fastify.log.info({ port }, 'Auth service listening');
  } catch (err) {
    fastify.log.error(err, 'Failed to start auth service');
    process.exit(1);
  }
}

start();
