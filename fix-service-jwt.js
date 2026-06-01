const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8');

const pubMatch = env.match(/^JWT_PUBLIC_KEY="(.+)"/m);
if (!pubMatch) { console.error('JWT_PUBLIC_KEY not found in root .env'); process.exit(1); }

// The public key stored with literal \n — convert to real newlines
const publicKey = pubMatch[1].replace(/\\n/g, '\n');

// Read each service .env and inject JWT_SECRET = public key
const services = ['services/challenge', 'services/content'];

for (const svc of services) {
  const envPath = `${svc}/.env`;
  if (!fs.existsSync(envPath)) continue;

  let content = fs.readFileSync(envPath, 'utf8');
  // Remove existing JWT_SECRET if present
  content = content.replace(/^JWT_SECRET=.*[\r\n]*/gm, '');
  content = content.replace(/^JWT_PUBLIC_KEY=.*[\r\n]*/gm, '');
  content = content.trimEnd();
  // JWT_SECRET = public key so @fastify/jwt can verify RS256 tokens
  content += `\nJWT_SECRET="${publicKey}"\n`;
  content += `JWT_PUBLIC_KEY="${publicKey}"\n`;
  fs.writeFileSync(envPath, content);
  console.log(`Updated ${envPath} with RSA public key as JWT_SECRET`);
}
