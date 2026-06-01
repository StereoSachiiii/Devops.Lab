const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8');

const privMatch = env.match(/^JWT_PRIVATE_KEY="(.+)"/m);
const pubMatch = env.match(/^JWT_PUBLIC_KEY="(.+)"/m);

if (!privMatch || !pubMatch) { console.error('Keys not found'); process.exit(1); }

// The keys are stored with literal \n — convert to real newlines for PEM
const privateKey = privMatch[1].replace(/\\n/g, '\n');
const publicKey = pubMatch[1].replace(/\\n/g, '\n');

let authEnv = fs.readFileSync('services/auth/.env', 'utf8');

// Remove old key lines
authEnv = authEnv.replace(/^JWT_PRIVATE_KEY=.*[\r\n]*/gm, '');
authEnv = authEnv.replace(/^JWT_PUBLIC_KEY=.*[\r\n]*/gm, '');
authEnv = authEnv.replace(/^# JWT RSA Keys[\r\n]*/gm, '');
authEnv = authEnv.trimEnd();

// Write back with real newlines inside the PEM (no escaping — dotenv handles multiline with quotes)
authEnv += '\n\n# JWT RSA Keys\n';
authEnv += `JWT_PRIVATE_KEY="${privateKey}"\n`;
authEnv += `JWT_PUBLIC_KEY="${publicKey}"\n`;

fs.writeFileSync('services/auth/.env', authEnv);
console.log('Done — auth .env written with real PEM newlines');
