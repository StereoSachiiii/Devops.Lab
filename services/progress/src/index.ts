import { buildApp } from './app';

const app = buildApp();
const port = Number(process.env['PORT']) || 3003;

async function start() {
  try {
    await app.listen({ port, host: '0.0.0.0' });
    console.log(`📈 Progress service listening on port ${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
