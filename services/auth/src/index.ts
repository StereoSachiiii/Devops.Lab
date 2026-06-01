import { initObservability } from '@devops/observability';

const obs = initObservability('auth-service');

import { buildApp } from './app';

const port = Number(process.env['PORT']) || 3002;

const start = async () => {
  const fastify = buildApp(obs);
  try {
    await fastify.listen({ port, host: '0.0.0.0' });
    fastify.log.info({ port }, 'Auth service listening');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
