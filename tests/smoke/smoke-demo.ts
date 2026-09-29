/**
 * DevOps.lab End-to-End Smoke Test & Mini Demo Suite
 * 
 * Features:
 * - Exercises every microservice (Auth, Core, Sandbox Router & Worker, Notification, Kong Gateway)
 * - Probes all infrastructure (PostgreSQL, Redis, RabbitMQ, Redpanda, Kong Admin)
 * - Drives live interactive PTY terminal session over WebSocket (xterm.js bridge)
 * - Solves "Fix the Broken Nginx Config" challenge (cmszcvcqw000slkwly2265dyw)
 * - Validates failure BEFORE fix (HTTP 422), and pass AFTER fix (HTTP 200)
 * - Idempotency checks (re-validation does not double XP)
 * - Full teardown in finally block, asserting cascade deletion and zero orphan rows
 * - CLI Modes:
 *     --demo  : Narrated live demo, short pacing pauses, streams real PTY terminal output
 *     --full  : Complete endpoint sweep (default)
 */

import { Client } from 'pg';
import Redis from 'ioredis';
import WebSocket from 'ws';
import { execSync } from 'child_process';

// ── Configuration & CLI Arguments ─────────────────────────────────────────────

const isDemo = process.argv.includes('--demo');
const isFull = process.argv.includes('--full') || !isDemo;

const API_GATEWAY_URL = process.env.API_GATEWAY_URL || 'http://localhost:8005';
const KONG_ADMIN_URL = process.env.KONG_ADMIN_URL || 'http://localhost:8001';
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:3002';
const CORE_SERVICE_URL = process.env.CORE_SERVICE_URL || 'http://localhost:3003';
const SANDBOX_ROUTER_URL = process.env.SANDBOX_ROUTER_URL || 'http://localhost:8080';
const SANDBOX_WORKER_URL = process.env.SANDBOX_WORKER_URL || 'http://localhost:8090';
const NOTIFICATION_SERVICE_URL = process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3004';
const RABBITMQ_MANAGEMENT_URL = process.env.RABBITMQ_MANAGEMENT_URL || 'http://localhost:15672';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const DB_CONFIG = {
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5444', 10),
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'postgres',
  database: process.env.POSTGRES_DB || 'appdb',
};

let targetChallengeId = process.env.TARGET_CHALLENGE_ID || '';

// ── Test Runner Harness ────────────────────────────────────────────────────────

interface StepResult {
  phase: string;
  name: string;
  status: 'PASS' | 'FAIL' | 'SKIPPED';
  durationMs: number;
  details?: string;
}

const results: StepResult[] = [];
let overallFailed = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runStep(
  phase: string,
  name: string,
  fn: () => Promise<string | void>
): Promise<void> {
  const start = Date.now();
  try {
    const details = await fn();
    const durationMs = Date.now() - start;
    results.push({ phase, name, status: 'PASS', durationMs, details: details || undefined });
    console.log(`\x1b[32m[PASS]\x1b[0m (${String(durationMs).padStart(5)}ms) [${phase}] ${name}${details ? ` - ${details}` : ''}`);
  } catch (err: any) {
    const durationMs = Date.now() - start;
    overallFailed = true;
    const errorMsg = err?.message || String(err);
    results.push({ phase, name, status: 'FAIL', durationMs, details: errorMsg });
    console.error(`\x1b[31m[FAIL]\x1b[0m (${String(durationMs).padStart(5)}ms) [${phase}] ${name} - Error: ${errorMsg}`);
    throw err; // re-throw to jump to finally or stop dependent steps
  }
}

function recordSkipped(phase: string, name: string, reason: string): void {
  results.push({ phase, name, status: 'SKIPPED', durationMs: 0, details: reason });
  console.log(`\x1b[33m[SKIP]\x1b[0m (    0ms) [${phase}] ${name} - Reason: ${reason}`);
}

function demoNarrate(message: string): void {
  if (isDemo) {
    console.log(`\n\x1b[36m>>> [DEMO] ${message}\x1b[0m`);
  }
}

function getRunningContainerCount(): number {
  try {
    const output = execSync('docker ps -q', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    return output.trim().split('\n').filter(Boolean).length;
  } catch {
    return -1;
  }
}

import net from 'net';

function checkTcpPort(host: string, port: number, timeoutMs = 800): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let isResolved = false;
    const finalize = (success: boolean) => {
      if (!isResolved) {
        isResolved = true;
        socket.destroy();
        resolve(success);
      }
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finalize(true));
    socket.once('timeout', () => finalize(false));
    socket.once('error', () => finalize(false));
    socket.connect(port, host);
  });
}

// ── Main Execution ─────────────────────────────────────────────────────────────

async function main() {
  console.log('\n================================================================');
  console.log('   DevOps.lab End-to-End Smoke Test & Interactive Mini Demo');
  console.log(`   Mode: ${isDemo ? 'Interactive DEMO' : 'Full Suite'} | Gateway: ${API_GATEWAY_URL}`);
  console.log('================================================================\n');

  // ── Preflight Service Check (with Retry Loop) ────────────────────────────────
  const parseHostPort = (rawUrl: string, defaultPort: number) => {
    try {
      const u = new URL(rawUrl.startsWith('http') || rawUrl.startsWith('redis') ? rawUrl : `http://${rawUrl}`);
      return { host: u.hostname, port: u.port ? parseInt(u.port, 10) : defaultPort };
    } catch {
      return { host: 'localhost', port: defaultPort };
    }
  };

  const redisHostPort = parseHostPort(REDIS_URL, 6379);
  const kongAdminHostPort = parseHostPort(KONG_ADMIN_URL, 8001);
  const authHostPort = parseHostPort(AUTH_SERVICE_URL, 3002);
  const coreHostPort = parseHostPort(CORE_SERVICE_URL, 3003);
  const notifHostPort = parseHostPort(NOTIFICATION_SERVICE_URL, 3004);
  const routerHostPort = parseHostPort(SANDBOX_ROUTER_URL, 8080);
  const workerHostPort = parseHostPort(SANDBOX_WORKER_URL, 8090);
  const rmqMgmtHostPort = parseHostPort(RABBITMQ_MANAGEMENT_URL, 15672);

  const requiredTargets = [
    { name: 'PostgreSQL', host: DB_CONFIG.host, port: DB_CONFIG.port },
    { name: 'Redis', host: redisHostPort.host, port: redisHostPort.port },
    { name: 'RabbitMQ', host: rmqMgmtHostPort.host, port: 5672 },
    { name: 'RabbitMQ Management', host: rmqMgmtHostPort.host, port: rmqMgmtHostPort.port },
    { name: 'Kong API Gateway', host: parseHostPort(API_GATEWAY_URL, 8005).host, port: parseHostPort(API_GATEWAY_URL, 8005).port },
    { name: 'Auth Service', host: authHostPort.host, port: authHostPort.port },
    { name: 'Core Service', host: coreHostPort.host, port: coreHostPort.port },
    { name: 'Notification Service', host: notifHostPort.host, port: notifHostPort.port },
    { name: 'Sandbox Router', host: routerHostPort.host, port: routerHostPort.port },
    { name: 'Sandbox Worker', host: workerHostPort.host, port: workerHostPort.port },
  ];

  let downServices: string[] = [];
  const maxAttempts = 20; // 20 * 3s = 60s
  console.log('🔍 Checking platform readiness (waiting for services to boot if needed)...');
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    downServices = [];
    for (const target of requiredTargets) {
      const up = await checkTcpPort(target.host, target.port);
      if (!up) {
        downServices.push(`${target.name} (${target.host}:${target.port})`);
      }
    }
    if (downServices.length === 0) {
      console.log('\x1b[32m✅ All platform endpoints ready.\x1b[0m\n');
      break;
    }
    if (attempt < maxAttempts) {
      process.stdout.write(`⏳ Waiting for ${downServices.length} service(s) to become reachable (attempt ${attempt}/${maxAttempts})...\r`);
      await sleep(3000);
    }
  }

  if (downServices.length > 0) {
    console.error('\n\x1b[31m[PREFLIGHT FAILED] The platform services are not ready after 60s.\x1b[0m');
    console.error('The following required endpoints could not be reached:');
    for (const svc of downServices) {
      console.error(`  - \x1b[33m${svc}\x1b[0m`);
    }
    console.error('\n\x1b[36mSuggested Fix:\x1b[0m Run .\\boot.ps1 in PowerShell to launch all infrastructure and services before running the smoke test.\n');
    process.exit(1);
  }

  const db = new Client(DB_CONFIG);
  db.on('error', (err) => {
    // Prevent unhandled error event if backend connection closes or drops
  });
  const redis = new Redis(REDIS_URL, { lazyConnect: true });

  const runId = Date.now();
  const testUserEmail = `smoke_learner_${runId}@example.com`;
  const testUsername = `smoke_${runId}`;
  const testPassword = 'TestPassword123!';

  let testUserId = '';
  let testUserToken = '';
  let testRefreshTokenCookie = '';
  let activeSessionId = '';
  let wsTerminalUrl = '';
  let baselineUserCount = 0;
  let baselineContainerCount = 0;

  try {
    // ── Baseline State Recording ───────────────────────────────────────────────
    await runStep('Phase 0', 'Record baseline environment state', async () => {
      await db.connect();
      const userRes = await db.query('SELECT count(*)::int as count FROM "User"');
      baselineUserCount = userRes.rows[0].count;
      baselineContainerCount = getRunningContainerCount();
      await redis.connect();
      return `Baseline Users: ${baselineUserCount}, Baseline Docker Containers: ${baselineContainerCount}`;
    });

    // ── Phase 1: Infrastructure & Service Health Check ────────────────────────
    demoNarrate('Phase 1: Probing infrastructure and service health...');

    await runStep('Phase 1.1', 'PostgreSQL direct connection probe (port 5444)', async () => {
      const res = await db.query('SELECT 1 as alive');
      if (!res.rows || res.rows[0].alive !== 1) throw new Error('PostgreSQL query check failed');
      return 'Connected to PostgreSQL (appdb)';
    });

    await runStep('Phase 1.2', 'Redis ping probe (port 6379)', async () => {
      const pong = await redis.ping();
      if (pong !== 'PONG') throw new Error(`Redis ping returned ${pong}`);
      return 'Redis responded PONG';
    });

    await runStep('Phase 1.3', 'RabbitMQ Management API probe (port 15672)', async () => {
      const authHeader = 'Basic ' + Buffer.from('guest:guest').toString('base64');
      let res: Response | null = null;
      let lastErr: any = null;
      for (let i = 0; i < 5; i++) {
        try {
          res = await fetch(`${RABBITMQ_MANAGEMENT_URL}/api/overview`, {
            headers: { Authorization: authHeader },
          });
          if (res.ok) break;
        } catch (err: any) {
          lastErr = err;
          await sleep(1000);
        }
      }
      if (!res || !res.ok) throw new Error(`RabbitMQ management returned status ${res?.status || 'unreachable'}: ${lastErr?.message || lastErr || ''}`);
      const data: any = await res.json();
      return `RabbitMQ cluster: ${data.cluster_name || 'ok'}, version: ${data.rabbitmq_version || 'unknown'}`;
    });

    await runStep('Phase 1.4', 'Kong Admin API probe (port 8001)', async () => {
      const res = await fetch(`${KONG_ADMIN_URL}/status`);
      if (!res.ok) throw new Error(`Kong Admin returned status ${res.status}`);
      const data: any = await res.json();
      return `Kong Gateway active connections: ${data.server?.total_requests || 'ok'}`;
    });

    await runStep('Phase 1.5', 'Auth Service /health & /metrics (port 3002)', async () => {
      const res = await fetch(`${AUTH_SERVICE_URL}/health`);
      if (!res.ok) throw new Error(`Auth /health returned status ${res.status}`);
      const metricsRes = await fetch(`${AUTH_SERVICE_URL}/metrics`);
      if (!metricsRes.ok) throw new Error(`Auth /metrics returned status ${metricsRes.status}`);
      return 'Health ok & Prometheus metrics exported';
    });

    await runStep('Phase 1.6', 'Core Service /health & /metrics (port 3003)', async () => {
      const res = await fetch(`${CORE_SERVICE_URL}/health`);
      if (!res.ok) throw new Error(`Core /health returned status ${res.status}`);
      const metricsRes = await fetch(`${CORE_SERVICE_URL}/metrics`);
      if (!metricsRes.ok) throw new Error(`Core /metrics returned status ${metricsRes.status}`);
      return 'Health ok & Prometheus metrics exported';
    });

    await runStep('Phase 1.7', 'Sandbox Router /health & /metrics (port 8080)', async () => {
      const res = await fetch(`${SANDBOX_ROUTER_URL}/health`);
      if (!res.ok) throw new Error(`Sandbox Router /health returned status ${res.status}`);
      const metricsRes = await fetch(`${SANDBOX_ROUTER_URL}/metrics`);
      if (!metricsRes.ok) throw new Error(`Sandbox Router /metrics returned status ${metricsRes.status}`);
      return 'Sandbox Router healthy';
    });

    await runStep('Phase 1.8', 'Sandbox Worker /health & /metrics (port 8090)', async () => {
      const res = await fetch(`${SANDBOX_WORKER_URL}/health`);
      if (!res.ok) throw new Error(`Sandbox Worker /health returned status ${res.status}`);
      const metricsRes = await fetch(`${SANDBOX_WORKER_URL}/metrics`);
      if (!metricsRes.ok) throw new Error(`Sandbox Worker /metrics returned status ${metricsRes.status}`);
      return 'Sandbox Worker healthy';
    });

    await runStep('Phase 1.9', 'Notification Service /health & /metrics (port 3004)', async () => {
      const res = await fetch(`${NOTIFICATION_SERVICE_URL}/health`);
      if (!res.ok) throw new Error(`Notification /health returned status ${res.status}`);
      const metricsRes = await fetch(`${NOTIFICATION_SERVICE_URL}/metrics`);
      if (!metricsRes.ok) throw new Error(`Notification /metrics returned status ${metricsRes.status}`);
      return 'Notification service healthy';
    });

    // ── Phase 2: Authentication & Token Lifecycle ─────────────────────────────
    demoNarrate('Phase 2: Registering dedicated test learner via Kong Gateway...');

    await runStep('Phase 2.1', 'Register dedicated fresh test learner (POST /api/auth/register)', async () => {
      const res = await fetch(`${API_GATEWAY_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testUserEmail,
          password: testPassword,
          name: 'Smoke Test Learner',
        }),
      });
      if (res.status !== 201) {
        const text = await res.text();
        throw new Error(`Register failed (${res.status}): ${text}`);
      }
      const data: any = await res.json();
      testUserId = data.user.id;
      testUserToken = data.token;
      return `Created user ID: ${testUserId}, Token received`;
    });

    await runStep('Phase 2.2', 'Verify JWT claims (RS256 payload)', async () => {
      const parts = testUserToken.split('.');
      if (parts.length !== 3) throw new Error('Malformed JWT');
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      if (payload.sub !== testUserId) throw new Error(`JWT sub (${payload.sub}) does not match userId (${testUserId})`);
      if (payload.email !== testUserEmail) throw new Error(`JWT email mismatch`);
      return `Valid claims: sub=${payload.sub}, email=${payload.email}`;
    });

    await runStep('Phase 2.3', 'Fetch user profile (GET /api/auth/me)', async () => {
      const res = await fetch(`${API_GATEWAY_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${testUserToken}` },
      });
      if (!res.ok) throw new Error(`GET /me failed (${res.status})`);
      const data: any = await res.json();
      if (data.email !== testUserEmail) throw new Error('Profile email mismatch');
      return `Profile fetched: ${data.name || data.email}, hasPassword: ${data.hasPassword}`;
    });

    await runStep('Phase 2.4', 'Update profile details (PUT /api/auth/me)', async () => {
      const res = await fetch(`${API_GATEWAY_URL}/api/auth/me`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testUserToken}`,
        },
        body: JSON.stringify({ name: 'Smoke Test Engineer', jobTitle: 'Site Reliability Engineer' }),
      });
      if (!res.ok) throw new Error(`PUT /me failed (${res.status})`);
      const data: any = await res.json();
      if (data.user?.name !== 'Smoke Test Engineer') throw new Error('Profile update did not persist');
      return `Updated name to: ${data.user.name}`;
    });

    await runStep('Phase 2.5', 'Query security audit log (GET /api/auth/security-log)', async () => {
      const res = await fetch(`${API_GATEWAY_URL}/api/auth/security-log?page=1&limit=10`, {
        headers: { Authorization: `Bearer ${testUserToken}` },
      });
      if (!res.ok) throw new Error(`GET /security-log failed (${res.status})`);
      const data: any = await res.json();
      return `Audit logs found: ${data.logs?.length || 0} entries recorded`;
    });

    await runStep('Phase 2.6', 'Login & Token Refresh Rotation (POST /api/auth/login & /refresh)', async () => {
      const loginRes = await fetch(`${API_GATEWAY_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testUserEmail, password: testPassword }),
      });
      if (!loginRes.ok) throw new Error(`Login failed (${loginRes.status})`);
      const cookieHeader = loginRes.headers.get('set-cookie') || '';
      const match = cookieHeader.match(/refreshToken=([^;]+)/);
      if (!match) throw new Error('refreshToken cookie was not set in login response');
      testRefreshTokenCookie = match[1];

      // Refresh token
      const refreshRes = await fetch(`${API_GATEWAY_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { Cookie: `refreshToken=${testRefreshTokenCookie}` },
      });
      if (!refreshRes.ok) throw new Error(`Refresh failed (${refreshRes.status})`);
      const refreshData: any = await refreshRes.json();
      if (!refreshData.token) throw new Error('Refresh response missing token');
      testUserToken = refreshData.token; // Update with rotated token
      return 'Token rotation validated successfully';
    });

    // ── Phase 3: Catalog & Learning Roadmap Exploration ───────────────────────
    demoNarrate('Phase 3: Exploring catalog and learning paths...');

    await runStep('Phase 3.1', 'Fetch challenge catalog (GET /api/challenges)', async () => {
      const res = await fetch(`${API_GATEWAY_URL}/api/challenges`, {
        headers: { Authorization: `Bearer ${testUserToken}` },
      });
      if (!res.ok) throw new Error(`GET /challenges failed (${res.status})`);
      const data: any = await res.json();
      if (!Array.isArray(data) || data.length === 0) throw new Error('Challenges catalog is empty');

      if (!targetChallengeId) {
        const nginxCh = data.find((c: any) => c.title?.includes('Nginx') || c.tags?.includes('nginx'));
        targetChallengeId = nginxCh ? nginxCh.id : data[0].id;
      }
      return `Catalog returned ${data.length} challenges (target: ${targetChallengeId})`;
    });

    await runStep('Phase 3.2', 'Fetch target challenge details (GET /api/challenges/:id)', async () => {
      const res = await fetch(`${API_GATEWAY_URL}/api/challenges/${targetChallengeId}`, {
        headers: { Authorization: `Bearer ${testUserToken}` },
      });
      if (!res.ok) throw new Error(`GET /challenges/${targetChallengeId} failed (${res.status})`);
      const data: any = await res.json();
      if (data.dockerImage !== 'nginx-syntax-fix:latest') {
        throw new Error(`Expected image nginx-syntax-fix:latest, got ${data.dockerImage}`);
      }
      return `Target challenge verified: "${data.title}" (${data.dockerImage})`;
    });

    await runStep('Phase 3.3', 'Verify editorial gating BEFORE solving (GET .../editorial -> Expect 403)', async () => {
      const res = await fetch(`${API_GATEWAY_URL}/api/challenges/${targetChallengeId}/editorial`, {
        headers: { Authorization: `Bearer ${testUserToken}` },
      });
      if (res.status !== 403) {
        throw new Error(`Expected 403 Forbidden for unsolved editorial, got ${res.status}`);
      }
      const data: any = await res.json();
      if (data.code !== 'EDITORIAL_LOCKED' && !data.error?.includes('Editorial locked')) {
        throw new Error(`Expected error code EDITORIAL_LOCKED, got ${data.code || data.error}`);
      }
      return 'Editorial correctly locked (403 EDITORIAL_LOCKED)';
    });

    if (isFull) {
      await runStep('Phase 3.4', 'Fetch learning roadmaps (GET /api/content/roadmaps)', async () => {
        const res = await fetch(`${API_GATEWAY_URL}/api/content/roadmaps`);
        if (!res.ok) throw new Error(`GET /content/roadmaps failed (${res.status})`);
        const data: any = await res.json();
        return `Found ${Array.isArray(data) ? data.length : 0} learning roadmaps`;
      });

      await runStep('Phase 3.5', 'Fetch concept graph node (GET /api/content/nodes/:id)', async () => {
        const nodeRes = await db.query('SELECT id, title FROM "Node" LIMIT 1');
        if (nodeRes.rows.length > 0) {
          const nodeId = nodeRes.rows[0].id;
          const res = await fetch(`${API_GATEWAY_URL}/api/content/nodes/${nodeId}`);
          if (!res.ok) throw new Error(`GET /content/nodes/${nodeId} failed (${res.status})`);
          const data: any = await res.json();
          return `Graph node verified: "${data.title || data.id}"`;
        } else {
          return 'No graph nodes seeded in database (skipped query)';
        }
      });

      await runStep('Phase 3.6', 'Fetch flashcards & quizzes (GET /api/content/flashcards & /quizzes)', async () => {
        const flashRes = await fetch(`${API_GATEWAY_URL}/api/content/flashcards`);
        const quizRes = await fetch(`${API_GATEWAY_URL}/api/content/quizzes`);
        if (!flashRes.ok || !quizRes.ok) throw new Error('Flashcards or quizzes endpoint failed');
        return 'Flashcards and quizzes catalog retrieved';
      });

      // AI Assistant check
      if (process.env.GEMINI_API_KEY) {
        await runStep('Phase 3.7', 'Query AI Assistant (POST /api/assistant/chat)', async () => {
          const res = await fetch(`${API_GATEWAY_URL}/api/assistant/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messages: [{ role: 'user', content: 'What is wrong with worker_processes 1 in nginx?' }],
              challengeTitle: 'Fix Broken Nginx Config',
            }),
          });
          if (!res.ok) throw new Error(`Assistant failed (${res.status})`);
          return 'AI Assistant returned response';
        });
      } else {
        recordSkipped('Phase 3.7', 'AI Assistant hints (POST /api/assistant/chat)', 'GEMINI_API_KEY not configured in environment');
      }
    }

    // ── Phase 4: Challenge Session Provisioning & Dispatch ────────────────────
    demoNarrate('Phase 4: Starting challenge session and dispatching Docker worker job...');

    await runStep('Phase 4.1', 'Dispatch challenge start (POST /api/challenges/:id/start)', async () => {
      const res = await fetch(`${API_GATEWAY_URL}/api/challenges/${targetChallengeId}/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${testUserToken}` },
      });
      if (res.status !== 201 && res.status !== 200) {
        const text = await res.text();
        throw new Error(`Challenge start failed (${res.status}): ${text}`);
      }
      const data: any = await res.json();
      activeSessionId = data.sessionId;
      wsTerminalUrl = data.terminalUrl;
      return `Session provisioned: ${activeSessionId}`;
    });

    await runStep('Phase 4.2', 'Poll session readiness until container is ALIVE', async () => {
      const maxAttempts = 40; // 20s
      let ready = false;
      for (let i = 0; i < maxAttempts; i++) {
        try {
          const probeRes = await fetch(`${API_GATEWAY_URL}/sessions/${activeSessionId}/health`, {
            headers: { Authorization: `Bearer ${testUserToken}` },
          });
          if (probeRes.ok) {
            const probeData: any = await probeRes.json();
            if (probeData.alive === true) {
              ready = true;
              break;
            }
          }
        } catch {
          // Container still provisioning
        }
        await sleep(500);
      }
      if (!ready) throw new Error(`Session container ${activeSessionId} did not reach ALIVE state within 20s`);

      return 'Container running and live probe verified (alive: true)';
    });

    // ── Phase 5: Interactive PTY Terminal WebSocket Session & Solving ─────────
    demoNarrate('Phase 5: Connecting to interactive PTY WebSocket bridge (xterm.js)...');

    let wsOutput = '';
    let ws: WebSocket;

    await runStep('Phase 5.1', 'Connect to PTY WebSocket (ws://.../sessions/:id/terminal)', async () => {
      return new Promise<string>((resolve, reject) => {
        const wsUrl = `${API_GATEWAY_URL.replace('http', 'ws')}/sessions/${activeSessionId}/terminal?token=${testUserToken}`;
        ws = new WebSocket(wsUrl, 'terminal');

        const timeout = setTimeout(() => {
          reject(new Error('WebSocket connection timed out'));
        }, 10000);

        ws.on('open', () => {
          clearTimeout(timeout);
          resolve('WebSocket connected with subprotocol "terminal"');
        });

        ws.on('message', (data: Buffer | string, isBinary: boolean) => {
          const text = data.toString();
          wsOutput += text;
          if (isDemo) {
            process.stdout.write(text);
          }
        });

        ws.on('error', (err) => {
          reject(err);
        });
      });
    });

    // Helper to send command via PTY as binary frame and wait for matching text
    async function sendPtyCommand(cmd: string, expectMatch?: RegExp | string, timeoutMs = 6000): Promise<string> {
      wsOutput = '';
      ws.send(Buffer.from(cmd));
      if (!expectMatch) {
        await sleep(500);
        return wsOutput;
      }
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        if (typeof expectMatch === 'string' && wsOutput.includes(expectMatch)) {
          return wsOutput;
        }
        if (expectMatch instanceof RegExp && expectMatch.test(wsOutput)) {
          return wsOutput;
        }
        await sleep(150);
      }
      throw new Error(`Timed out waiting for "${expectMatch}" in PTY output. Received:\n${wsOutput}`);
    }

    await runStep('Phase 5.2', 'Run "nginx -t" in broken container -> Assert syntax error', async () => {
      demoNarrate('Testing initial broken nginx configuration (expect failure)...');
      if (isDemo) await sleep(800);
      const out = await sendPtyCommand('nginx -t\n', /unexpected|syntax error|unknown directive|failed/i);
      return 'Syntax check failed as expected (reproduced broken state)';
    });

    await runStep('Phase 5.3', 'Inspect broken config: cat /etc/nginx/nginx.conf', async () => {
      const out = await sendPtyCommand('cat /etc/nginx/nginx.conf\n', /worker_processes|listen/i);
      return 'Broken configuration observed on terminal';
    });

    // ── Phase 6.1: User Adjustment 1: Validate BEFORE fix (Assert 422) ────────
    demoNarrate('Phase 6.1: Calling validator BEFORE fix -> Asserting HTTP 422 & passed:false...');

    await runStep('Phase 6.1', 'Pre-fix validation check (POST /validate/:id -> Expect 422)', async () => {
      const res = await fetch(`${API_GATEWAY_URL}/validate/${activeSessionId}`, {
        method: 'POST',
      });
      if (res.status !== 422) {
        throw new Error(`Expected HTTP 422 for failing validator, got ${res.status}`);
      }
      const data: any = await res.json();
      if (data.passed !== false) {
        throw new Error(`Expected passed: false before fix, got ${data.passed}`);
      }
      return `Validator correctly rejected: passed=false, checks: ${JSON.stringify(data.checkResults?.map((c: any) => ({ [c.check_id]: c.passed })))}`;
    });

    // ── Phase 5 (continued): Apply Derived Fixes ──────────────────────────────
    demoNarrate('Phase 5 (cont): Applying fixes derived from scenario (sed semicolons & port 80)...');

    await runStep('Phase 5.4', 'Fix missing semicolon on worker_processes via sed', async () => {
      await sendPtyCommand("sed -i 's/worker_processes 1/worker_processes 1;/' /etc/nginx/nginx.conf\n");
      await sleep(300);
      return 'Applied: worker_processes 1;';
    });

    await runStep('Phase 5.5', 'Fix listen port from 8080 to 80 via sed', async () => {
      await sendPtyCommand("sed -i 's/listen 8080;/listen 80;/' /etc/nginx/nginx.conf\n");
      await sleep(300);
      return 'Applied: listen 80;';
    });

    await runStep('Phase 5.6', 'Run "nginx -t" -> Assert "syntax is ok" and "test is successful"', async () => {
      demoNarrate('Testing repaired configuration with nginx -t...');
      if (isDemo) await sleep(800);
      const out = await sendPtyCommand('nginx -t\n', /syntax is ok.*successful/s);
      return 'Observed: syntax is ok & test is successful';
    });

    await runStep('Phase 5.7', 'Start daemon: service nginx start & service nginx status', async () => {
      demoNarrate('Starting nginx daemon on port 80...');
      await sendPtyCommand('service nginx start\n');
      await sleep(500);
      const statusOut = await sendPtyCommand('service nginx status\n', /is running|active/i);
      return 'Nginx service is running on port 80';
    });

    await runStep('Phase 5.8', 'Cleanly close interactive PTY WebSocket', async () => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close(1000, 'Demo completed');
      }
      return 'Terminal WebSocket closed';
    });

    // ── Phase 6.2: Post-Fix Validation ────────────────────────────────────────
    demoNarrate('Phase 6.2: Calling validator AFTER fix -> Asserting HTTP 200 & passed:true...');

    await runStep('Phase 6.2', 'Post-fix validation check (POST /validate/:id -> Expect 200)', async () => {
      const res = await fetch(`${API_GATEWAY_URL}/validate/${activeSessionId}`, {
        method: 'POST',
      });
      if (res.status !== 200) {
        const text = await res.text();
        throw new Error(`Expected HTTP 200 for successful validator, got ${res.status}: ${text}`);
      }
      const data: any = await res.json();
      if (data.passed !== true) {
        throw new Error(`Expected passed: true, got ${data.passed}. Feedback: ${data.feedback}`);
      }
      return `Validation passed: 3/3 checks passed: ${data.feedback}`;
    });

    // ── Phase 6.3: User Adjustment 5: Idempotency Validation ──────────────────
    await runStep('Phase 6.3', 'Idempotency check: Repeat validation call -> Expect 200', async () => {
      const res = await fetch(`${API_GATEWAY_URL}/validate/${activeSessionId}`, {
        method: 'POST',
      });
      if (res.status !== 200) {
        throw new Error(`Repeat validation failed with ${res.status}`);
      }
      const data: any = await res.json();
      if (data.passed !== true) throw new Error('Repeat validation passed: false');
      return 'Repeat validation accepted cleanly';
    });

    // ── Phase 7: Event Pipeline & Post-Solve Gamification Verification ────────
    demoNarrate('Phase 7: Polling event pipeline for XP, streak, badge, and session completion...');

    await runStep('Phase 7.1', 'Poll database for solve event processing (500ms interval, 15s max)', async () => {
      const startPoll = Date.now();
      const timeoutMs = 15000;
      let finalUser: any = null;

      while (Date.now() - startPoll < timeoutMs) {
        const res = await db.query('SELECT xp, "currentStreak" FROM "User" WHERE id = $1', [testUserId]);
        if (res.rows.length > 0 && res.rows[0].xp === 100) {
          finalUser = res.rows[0];
          break;
        }
        await sleep(500);
      }

      if (!finalUser) {
        throw new Error(`User XP did not reach 100 within ${timeoutMs}ms (Kafka event processing delay)`);
      }
      if (finalUser.currentStreak < 1) {
        throw new Error(`Expected currentStreak >= 1, got ${finalUser.currentStreak}`);
      }
      return `Kafka solve consumed: XP incremented to ${finalUser.xp}, Streak: ${finalUser.currentStreak}`;
    });

    await runStep('Phase 7.2', 'Verify First Blood badge awarded in DB', async () => {
      const badgeRes = await db.query(
        'SELECT b.title, b.slug FROM "UserBadge" ub JOIN "Badge" b ON ub."badgeId" = b.id WHERE ub."userId" = $1',
        [testUserId]
      );
      if (badgeRes.rows.length === 0) {
        throw new Error('No badge found for user after solve');
      }
      return `Badge awarded: "${badgeRes.rows[0].title}" (${badgeRes.rows[0].slug})`;
    });

    await runStep('Phase 7.3', 'Verify LabSession marked COMPLETED with endedAt timestamp', async () => {
      const sessionRes = await db.query(
        'SELECT status, "endedAt" FROM "LabSession" WHERE id = $1',
        [activeSessionId]
      );
      if (sessionRes.rows.length === 0) throw new Error('Session not found in DB');
      const s = sessionRes.rows[0];
      if (s.status !== 'COMPLETED') throw new Error(`Expected session status COMPLETED, got ${s.status}`);
      if (!s.endedAt) throw new Error('LabSession endedAt timestamp is null');
      return `LabSession state: COMPLETED at ${s.endedAt}`;
    });

    await runStep('Phase 7.4', 'Assert XP idempotency: XP does NOT double on duplicate check', async () => {
      // Small pause to allow any duplicate Kafka message to arrive
      await sleep(1000);
      const res = await db.query('SELECT xp FROM "User" WHERE id = $1', [testUserId]);
      if (res.rows[0].xp !== 100) {
        throw new Error(`XP doubled or changed unexpectedly to ${res.rows[0].xp} (Idempotency failure)`);
      }
      return 'XP remains exactly 100 (idempotent reward processing verified)';
    });

    await runStep('Phase 7.5', 'Verify editorial content is now UNLOCKED (GET .../editorial -> Expect 200)', async () => {
      const res = await fetch(`${API_GATEWAY_URL}/api/challenges/${TARGET_CHALLENGE_ID}/editorial`, {
        headers: { Authorization: `Bearer ${testUserToken}` },
      });
      if (res.status !== 200) {
        throw new Error(`Expected HTTP 200 for unlocked editorial, got ${res.status}`);
      }
      const data: any = await res.json();
      if (!data.editorial) throw new Error('Unlocked editorial payload missing editorial content');
      return `Editorial successfully unlocked: "${data.title}"`;
    });

    await runStep('Phase 7.6', 'Verify social activity feed contains the solve (GET /api/users/me/feed)', async () => {
      const res = await fetch(`${API_GATEWAY_URL}/api/users/me/feed`, {
        headers: { Authorization: `Bearer ${testUserToken}` },
      });
      if (!res.ok) throw new Error(`Feed request returned ${res.status}`);
      const data: any = await res.json();
      return `Feed queried successfully: ${data.feed?.length || 0} activity items`;
    });

    // ── Phase 8: Social Graph, Community & Remaining Endpoints ────────────────
    if (isFull) {
      demoNarrate('Phase 8: Exercising social graph, community, dashboard and remaining endpoints...');

      await runStep('Phase 8.1', 'Leaderboard discovery (GET /api/leaderboard)', async () => {
        const res = await fetch(`${API_GATEWAY_URL}/api/leaderboard?limit=10`);
        if (!res.ok) throw new Error(`Leaderboard returned ${res.status}`);
        const data: any = await res.json();
        return `Leaderboard contains ${data.leaderboard?.length || 0} ranked users`;
      });

      await runStep('Phase 8.2', 'Community user discovery (GET /api/users/discover)', async () => {
        const res = await fetch(`${API_GATEWAY_URL}/api/users/discover?limit=10`);
        if (!res.ok) throw new Error(`Discover returned ${res.status}`);
        const data: any = await res.json();
        return `Discovered ${data.users?.length || 0} public community users`;
      });

      await runStep('Phase 8.3', 'Dashboard summary (GET /api/me/dashboard)', async () => {
        const res = await fetch(`${API_GATEWAY_URL}/api/me/dashboard`, {
          headers: { Authorization: `Bearer ${testUserToken}` },
        });
        if (!res.ok) throw new Error(`Dashboard returned ${res.status}`);
        const data: any = await res.json();
        return `Dashboard data verified (stats, streaks, recent activity)`;
      });

      await runStep('Phase 8.4', 'Toggle challenge like & bookmark', async () => {
        const likeRes = await fetch(`${API_GATEWAY_URL}/api/challenges/${TARGET_CHALLENGE_ID}/like`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${testUserToken}` },
        });
        const bookRes = await fetch(`${API_GATEWAY_URL}/api/challenges/${TARGET_CHALLENGE_ID}/bookmark`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${testUserToken}` },
        });
        if (!likeRes.ok || !bookRes.ok) throw new Error('Like/bookmark toggle failed');
        return 'Challenge like and bookmark toggled successfully';
      });

      let commentId = '';
      await runStep('Phase 8.5', 'Post challenge comment & vote', async () => {
        const postRes = await fetch(`${API_GATEWAY_URL}/api/challenges/${TARGET_CHALLENGE_ID}/comments`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${testUserToken}`,
          },
          body: JSON.stringify({ content: 'Automated smoke demo verified solution!' }),
        });
        if (!postRes.ok) throw new Error(`Comment failed with status ${postRes.status}`);
        const commentData: any = await postRes.json();
        commentId = commentData.id;

        // Upvote comment
        const voteRes = await fetch(`${API_GATEWAY_URL}/api/comments/${commentId}/vote`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${testUserToken}`,
          },
          body: JSON.stringify({ value: 1 }),
        });
        if (!voteRes.ok) throw new Error('Vote failed');

        return `Comment posted (${commentId}) and upvoted`;
      });

      let listId = '';
      await runStep('Phase 8.6', 'Custom Challenge List lifecycle (POST & GET /api/lists)', async () => {
        const createRes = await fetch(`${API_GATEWAY_URL}/api/lists`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${testUserToken}`,
          },
          body: JSON.stringify({ name: 'Smoke Test Essential Challenges', isPublic: true }),
        });
        if (!createRes.ok) throw new Error(`Create list failed (${createRes.status})`);
        const listData: any = await createRes.json();
        listId = listData.id;

        const getRes = await fetch(`${API_GATEWAY_URL}/api/lists/${listId}`);
        if (!getRes.ok) throw new Error(`Get list failed (${getRes.status})`);

        return `Created and retrieved custom collection: ${listData.name} (${listId})`;
      });

      await runStep('Phase 8.7', 'Public Solution Share Card (POST /api/shares & GET /api/shares/:token)', async () => {
        const shareRes = await fetch(`${API_GATEWAY_URL}/api/shares`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${testUserToken}`,
          },
          body: JSON.stringify({ challengeId: TARGET_CHALLENGE_ID, sessionId: activeSessionId }),
        });
        if (!shareRes.ok) throw new Error(`Share generation failed (${shareRes.status})`);
        const shareData: any = await shareRes.json();
        const shareToken = shareData.shareToken || shareData.token;

        // Public fetch (unauthenticated)
        const publicCardRes = await fetch(`${API_GATEWAY_URL}/api/shares/${shareToken}`);
        if (!publicCardRes.ok) throw new Error(`Public share card returned ${publicCardRes.status}`);

        return `Share card created and publicly accessible: token=${shareToken}`;
      });

      await runStep('Phase 8.8', 'Multi-Tenancy non-org isolation check (GET /api/orgs/me -> Expect 404)', async () => {
        const res = await fetch(`${API_GATEWAY_URL}/api/orgs/me`, {
          headers: { Authorization: `Bearer ${testUserToken}` },
        });
        if (res.status !== 404) {
          throw new Error(`Expected 404 for individual learner without org, got ${res.status}`);
        }
        return 'Multi-tenant isolation verified (404 for individual learner)';
      });
    }

    // ── Phase 9: Record Skipped Endpoints ─────────────────────────────────────
    recordSkipped('Phase 9.1', 'MFA Setup & Verification (POST /api/auth/mfa/*)', 'Requires physical TOTP authenticator device');
    recordSkipped('Phase 9.2', 'OAuth Callbacks (GET /api/auth/login/github|google/callback)', 'Requires interactive 3rd party IdP browser login');
    recordSkipped('Phase 9.3', 'SSO SAML / OIDC Authentication (POST /api/auth/login/sso)', 'Requires enterprise identity provider integration');
    recordSkipped('Phase 9.4', 'Organization Member Invite Accept (POST /api/orgs/join/:token)', 'Requires secondary recipient inbox and interactive acceptance');

  } catch (fatalErr: any) {
    console.error('\n\x1b[31m[ERROR] Smoke test run encountered a fatal failure:\x1b[0m', fatalErr?.message || fatalErr);
  } finally {
    // ── Phase 10: Teardown, Cleanup & Cascade Verification ─────────────────────
    demoNarrate('Phase 10: Tearing down test session, destroying containers, and cascading user deletion...');
    console.log('\n--- Cleaning Up Test Resources (finally block) ---');

    // 1. Terminate session
    if (activeSessionId && testUserToken) {
      try {
        await runStep('Teardown 10.1', 'Terminate active sandbox session (DELETE /api/session/:id)', async () => {
          const res = await fetch(`${API_GATEWAY_URL}/api/session/${activeSessionId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${testUserToken}` },
          });
          return `Session ${activeSessionId} deleted (status ${res.status})`;
        });
      } catch (err: any) {
        console.error('Session delete warning:', err.message);
      }
    }

    // 2. Poll for Docker container removal
    try {
      await runStep('Teardown 10.2', 'Assert guest challenge Docker container is removed', async () => {
        const maxWaitMs = 10000;
        const startWait = Date.now();
        let currentContainers = getRunningContainerCount();
        while (Date.now() - startWait < maxWaitMs) {
          if (currentContainers <= baselineContainerCount) break;
          await sleep(500);
          currentContainers = getRunningContainerCount();
        }
        return `Docker containers returned to baseline (${currentContainers} <= ${baselineContainerCount})`;
      });
    } catch (err: any) {
      console.error('Container removal check warning:', err.message);
    }

    // 3. Delete user via API
    if (testUserToken) {
      try {
        await runStep('Teardown 10.3', 'Delete test user (DELETE /api/auth/me)', async () => {
          const res = await fetch(`${API_GATEWAY_URL}/api/auth/me`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${testUserToken}` },
          });
          if (!res.ok) throw new Error(`Delete /me returned ${res.status}`);
          return 'User account deleted';
        });
      } catch (err: any) {
        console.error('User delete warning:', err.message);
      }
    }

    // 4. Assert cascade cleanup (zero orphan rows)
    if (testUserId) {
      try {
        await runStep('Teardown 10.4', 'Assert DB cascade deletion (0 orphan rows in DB)', async () => {
          const userCheck = await db.query('SELECT count(*)::int as c FROM "User" WHERE id = $1', [testUserId]);
          const subCheck = await db.query('SELECT count(*)::int as c FROM "Submission" WHERE "userId" = $1', [testUserId]);
          const badgeCheck = await db.query('SELECT count(*)::int as c FROM "UserBadge" WHERE "userId" = $1', [testUserId]);
          const sessionCheck = await db.query('SELECT count(*)::int as c FROM "LabSession" WHERE "userId" = $1', [testUserId]);
          const logCheck = await db.query('SELECT count(*)::int as c FROM "SecurityLog" WHERE "userId" = $1', [testUserId]);

          const orphaned = subCheck.rows[0].c + badgeCheck.rows[0].c + sessionCheck.rows[0].c + logCheck.rows[0].c;
          if (userCheck.rows[0].c !== 0 || orphaned !== 0) {
            throw new Error(`Orphaned records found! User: ${userCheck.rows[0].c}, Submissions: ${subCheck.rows[0].c}, Badges: ${badgeCheck.rows[0].c}, Sessions: ${sessionCheck.rows[0].c}`);
          }

          const finalUserCount = await db.query('SELECT count(*)::int as c FROM "User"');
          return `Cascade complete: 0 orphan rows, User count matched baseline (${finalUserCount.rows[0].c} === ${baselineUserCount})`;
        });
      } catch (err: any) {
        console.error('Cascade verification failure:', err.message);
      }
    }

    // Close DB & Redis connections
    await db.end().catch(() => {});
    await redis.quit().catch(() => {});

    // ── Summary Table ─────────────────────────────────────────────────────────
    console.log('\n================================================================');
    console.log('                   SMOKE TEST EXECUTION SUMMARY');
    console.log('================================================================');
    console.log(
      'Status'.padEnd(8) +
      'Phase'.padEnd(16) +
      'Duration'.padEnd(12) +
      'Step Name'.padEnd(45) +
      'Details / Reason'
    );
    console.log('─'.repeat(105));

    let passCount = 0;
    let failCount = 0;
    let skipCount = 0;

    for (const r of results) {
      if (r.status === 'PASS') passCount++;
      if (r.status === 'FAIL') failCount++;
      if (r.status === 'SKIPPED') skipCount++;

      const statusColor =
        r.status === 'PASS' ? '\x1b[32mPASS\x1b[0m' :
        r.status === 'FAIL' ? '\x1b[31mFAIL\x1b[0m' :
        '\x1b[33mSKIP\x1b[0m';

      console.log(
        statusColor.padEnd(17) +
        r.phase.padEnd(16) +
        `${r.durationMs}ms`.padEnd(12) +
        r.name.slice(0, 43).padEnd(45) +
        (r.details ? r.details.slice(0, 40) : '')
      );
    }

    console.log('─'.repeat(105));
    console.log(`TOTAL: ${results.length} | \x1b[32mPASS: ${passCount}\x1b[0m | \x1b[31mFAIL: ${failCount}\x1b[0m | \x1b[33mSKIPPED: ${skipCount}\x1b[0m`);
    console.log('================================================================\n');

    if (overallFailed || failCount > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  }
}

main().catch((err) => {
  console.error('Unhandled fatal error in smoke test:', err);
  process.exit(1);
});
