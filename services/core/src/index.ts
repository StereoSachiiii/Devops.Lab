import 'dotenv/config';
import { initObservability } from '@devops/observability';
import { buildApp } from './app';

const SERVICE_NAME = 'core-service';
const { loggerOptions, stream, shutdown } = initObservability(SERVICE_NAME);

const PORT = parseInt(process.env['PORT'] ?? '3003', 10);

async function main() {
  const app = await buildApp({
    loggerOptions,
    stream,
    shutdown,
    jwtPublicKey: process.env['JWT_PUBLIC_KEY'] ?? '',
    sessionTTLMins: parseInt(process.env['SESSION_TTL_MINS'] ?? '60', 10),
  });

  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown());
process.on('SIGINT', () => shutdown());

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
