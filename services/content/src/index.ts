import { buildApp } from './app';

const fastify = buildApp();
const port = Number(process.env['PORT']) || 3001;

const start = async () => {
  try {
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`🚀 Content Service running on port ${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
