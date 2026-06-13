import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import type { ObservabilityConfig } from '@devops/observability';
import { generateKeyPairSync, createSign } from 'crypto';

// Generate test RSA key pair
const { privateKey: testPrivateKey, publicKey: testPublicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

// Sign a JWT manually for testing (core only has public key for verification)
function signTestToken(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000) })).toString('base64url');
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${body}`);
  const signature = signer.sign(testPrivateKey, 'base64url');
  return `${header}.${body}.${signature}`;
}

const mockObs: ObservabilityConfig = {
  loggerOptions: { level: 'silent' },
  stream: {} as any,
  shutdown: () => {},
};

const mockPrisma: any = {
  challenge: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn(),
  },
  labSession: {
    create: vi.fn(),
    updateMany: vi.fn(),
    findUnique: vi.fn(),
  },
  node: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn().mockResolvedValue([]),
    upsert: vi.fn(),
  },
  edge: {
    findMany: vi.fn().mockResolvedValue([]),
  },
  completion: {
    findMany: vi.fn().mockResolvedValue([]),
    upsert: vi.fn(),
  },
  user: {
    update: vi.fn(),
  },
  submission: {
    create: vi.fn(),
  },
  $queryRaw: vi.fn().mockResolvedValue([{ 1: 1 }]),
  $connect: vi.fn().mockResolvedValue(undefined),
  $disconnect: vi.fn().mockResolvedValue(undefined),
};

vi.mock('@devops/db', () => ({
  PrismaClient: class { constructor() { return mockPrisma; } },
}));

const mockKafka = {
  initProducer: vi.fn().mockResolvedValue(undefined),
  emit: vi.fn().mockResolvedValue(undefined),
  consume: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  isProducerReady: true,
};

vi.mock('@devops/messaging', () => ({
  MessagingService: class { constructor() { return mockKafka; } },
  RabbitMQService: class { constructor() { return { init: vi.fn().mockResolvedValue(undefined), publish: vi.fn().mockResolvedValue(undefined), consume: vi.fn().mockResolvedValue(undefined), disconnect: vi.fn().mockResolvedValue(undefined) }; } },
  SessionStartedEvent: class { constructor(payload: unknown) { Object.assign(this, { topic: 'sandbox.session.started', payload }); } },
  SessionEndedEvent: class { constructor(payload: unknown) { Object.assign(this, { topic: 'sandbox.session.ended', payload }); } },
  SessionEndReason: { TERMINATED: 'TERMINATED', COMPLETED: 'COMPLETED' },
  QUEUES: { PROVISION_SANDBOX: 'provision.sandbox', TERMINATE_SANDBOX: 'terminate.sandbox' },
}));

vi.mock('prom-client', async () => {
  const noop = vi.fn();
  return {
    default: { collectDefaultMetrics: vi.fn() },
    Registry: class {
      setDefaultLabels = vi.fn();
      metrics = vi.fn().mockResolvedValue('');
      contentType = 'text/plain';
      registerMetric = vi.fn();
    },
    Counter: class { inc = noop; },
    Histogram: class { observe = noop; startTimer = () => noop; },
    Gauge: class { set = noop; inc = noop; },
  };
});

vi.mock('@fastify/redis', () => {
  const plugin = async (fastify: any) => {
    fastify.decorate('redis', {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(1),
    });
  };
  (plugin as any)[Symbol.for('skip-override')] = true;
  return { default: plugin };
});

import { buildApp } from '../app';

describe('Core Service', () => {
  const appPromise = buildApp({
    ...mockObs,
    jwtPublicKey: testPublicKey,
    sessionTTLMins: 60,
  });

  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await appPromise;
    await app.ready();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  describe('GET /health', () => {
    it('returns 503 when a dependency is down', async () => {
      app.healthRegistry.clearCache();
      mockKafka.isProducerReady = false;
      const response = await app.inject({ method: 'GET', url: '/health' });
      expect(response.statusCode).toBe(503);
      const body = JSON.parse(response.payload);
      expect(body.status).toBe('degraded');
      expect(body.checks.kafka).toBe('down');
    });

    it('returns ok with all dependency checks', async () => {
      app.healthRegistry.clearCache();
      mockKafka.isProducerReady = true;
      const response = await app.inject({ method: 'GET', url: '/health' });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.status).toBe('ok');
      expect(body.service).toBe('core-service');
      expect(body.checks).toEqual({ db: 'up', kafka: 'up' });
    });
  });

  describe('GET /metrics', () => {
    it('returns prometheus metrics', async () => {
      const response = await app.inject({ method: 'GET', url: '/metrics' });
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/plain');
    });
  });

  describe('GET /api/challenges', () => {
    it('lists all challenges', async () => {
      const mockChallenges = [
        { id: 'c1', title: 'Linux Basics', difficulty: 'EASY' },
        { id: 'c2', title: 'Nginx Config', difficulty: 'MEDIUM' },
      ];
      mockPrisma.challenge.findMany.mockResolvedValueOnce(mockChallenges);

      const response = await app.inject({ method: 'GET', url: '/api/challenges' });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body).toHaveLength(2);
    });
  });

  describe('GET /api/challenges/:id', () => {
    it('returns 404 for non-existent challenge', async () => {
      mockPrisma.challenge.findUnique.mockResolvedValueOnce(null);

      const response = await app.inject({ method: 'GET', url: '/api/challenges/nonexistent' });
      expect(response.statusCode).toBe(404);
    });

    it('returns challenge details', async () => {
      mockPrisma.challenge.findUnique.mockResolvedValueOnce({
        id: 'c1',
        title: 'Linux Basics',
        description: 'Learn Linux',
      });

      const response = await app.inject({ method: 'GET', url: '/api/challenges/c1' });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.id).toBe('c1');
    });
  });

  describe('POST /api/challenges/:id/start', () => {
    it('requires authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/challenges/c1/start',
      });
      expect(response.statusCode).toBe(401);
    });

    it('creates a session and emits Kafka event', async () => {
      mockPrisma.challenge.findUnique.mockResolvedValueOnce({
        id: 'c1',
        dockerImage: 'linux-basics:latest',
        title: 'Linux Basics',
      });
      mockPrisma.labSession.create.mockResolvedValueOnce({ id: 'session-1' });

      const token = signTestToken({ sub: 'user-1', email: 'test@example.com', role: 'LEARNER' });

      const response = await app.inject({
        method: 'POST',
        url: '/api/challenges/c1/start',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload);
      expect(body.sessionId).toBeDefined();
      expect(body.challengeId).toBe('c1');
      expect(mockPrisma.labSession.create).toHaveBeenCalled();
      expect(mockKafka.emit).toHaveBeenCalled();
    });
  });

  describe('DELETE /api/session/:id', () => {
    it('terminates an active session and emits Kafka event', async () => {
      mockPrisma.labSession.updateMany.mockResolvedValueOnce({ count: 1 });
      const token = signTestToken({ sub: 'user-1', email: 'test@example.com', role: 'LEARNER' });

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/session/session-1',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(204);
      expect(mockKafka.emit).toHaveBeenCalled();
    });
  });

  describe('GET /nodes/:id', () => {
    it('returns 404 for non-existent node', async () => {
      mockPrisma.node.findUnique.mockResolvedValueOnce(null);

      const response = await app.inject({ method: 'GET', url: '/nodes/nonexistent' });
      expect(response.statusCode).toBe(404);
    });

    it('returns node details', async () => {
      mockPrisma.node.findUnique.mockResolvedValueOnce({
        id: 'n1',
        type: 'SCENARIO',
        title: 'Test Node',
      });

      const response = await app.inject({ method: 'GET', url: '/nodes/n1' });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.id).toBe('n1');
    });
  });

  describe('GET /nodes/:id/parents', () => {
    it('returns parent nodes', async () => {
      mockPrisma.edge.findMany.mockResolvedValueOnce([
        { fromId: 'n1', to: { id: 'parent1', title: 'Parent Node' } },
      ]);

      const response = await app.inject({ method: 'GET', url: '/nodes/n1/parents' });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.nodes).toHaveLength(1);
    });
  });

  describe('GET /nodes/:id/children', () => {
    it('returns child nodes', async () => {
      mockPrisma.edge.findMany.mockResolvedValueOnce([
        { toId: 'n1', from: { id: 'child1', title: 'Child Node' } },
      ]);

      const response = await app.inject({ method: 'GET', url: '/nodes/n1/children' });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.nodes).toHaveLength(1);
    });
  });

  describe('GET /nodes/:id/ancestors', () => {
    it('returns ancestor nodes via recursive CTE', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        { id: 'a1', title: 'Ancestor 1' },
      ]);

      const response = await app.inject({ method: 'GET', url: '/nodes/n1/ancestors' });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.nodes).toHaveLength(1);
    });
  });

  describe('GET /users/:id/frontier', () => {
    it('returns unlocked nodes for a user', async () => {
      mockPrisma.completion.findMany.mockResolvedValueOnce([{ nodeId: 'completed-1' }]);
      mockPrisma.node.findMany.mockResolvedValueOnce([
        { id: 'n1', outgoing: [{ toId: 'completed-1' }] },
        { id: 'n2', outgoing: [{ toId: 'not-completed' }] },
      ]);

      const response = await app.inject({ method: 'GET', url: '/users/user-1/frontier' });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.nodes).toHaveLength(1);
      expect(body.nodes[0].id).toBe('n1');
    });
  });

  describe('GET /quizzes', () => {
    it('returns quizzes with correctIndex stripped', async () => {
      mockPrisma.node.findMany.mockResolvedValueOnce([
        {
          id: 'q1',
          type: 'QUIZ',
          metadata: {
            questions: [
              { id: 'q1-1', text: 'What is 2+2?', correctIndex: 1, options: ['3', '4', '5'] },
            ],
          },
        },
      ]);

      const response = await app.inject({ method: 'GET', url: '/quizzes' });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.quizzes[0].metadata.questions[0].correctIndex).toBeUndefined();
    });
  });

  describe('POST /quizzes/:id/submit', () => {
    it('validates answers and returns results', async () => {
      mockPrisma.node.findFirst.mockResolvedValueOnce({
        id: 'q1',
        type: 'QUIZ',
        metadata: {
          questions: [
            { id: 'q1-1', correctIndex: 1 },
            { id: 'q1-2', correctIndex: 0 },
          ],
        },
      });
      mockPrisma.completion.upsert.mockResolvedValueOnce({});

      const response = await app.inject({
        method: 'POST',
        url: '/quizzes/q1/submit',
        payload: {
          userId: 'user-1',
          answers: { 'q1-1': 1, 'q1-2': 0 },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.passed).toBe(true);
      expect(body.score).toBe(2);
    });

    it('returns 400 when userId or answers are missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/quizzes/q1/submit',
        payload: {},
      });
      expect(response.statusCode).toBe(400);
    });
  });
});
