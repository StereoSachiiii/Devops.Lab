import 'dotenv/config';
import { buildApp } from './app';

const PORT = parseInt(process.env['PORT'] ?? '3004', 10);

async function main() {
  const app = await buildApp({
    jwtSecret:      (process.env['JWT_PUBLIC_KEY'] ?? process.env['JWT_SECRET'])!,
    rabbitMQUrl:    process.env['RABBITMQ_URL'] ?? 'amqp://guest:guest@localhost:5672',
    sessionQueue:   process.env['SESSION_QUEUE'] ?? 'sandbox.sessions',
    sessionTTLMins: parseInt(process.env['SESSION_TTL_MINS'] ?? '60', 10),
  });

  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`🚀 Challenge service running on port ${PORT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
