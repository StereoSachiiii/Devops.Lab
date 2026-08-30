import { describe, it, expect, vi, beforeAll } from "vitest";
import type { ObservabilityConfig } from "@devops/observability";
import { generateKeyPairSync, createSign } from "crypto";

const { privateKey: testPrivateKey, publicKey: testPublicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

function signTestToken(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(
    JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000) })
  ).toString("base64url");
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${body}`);
  const signature = signer.sign(testPrivateKey, "base64url");
  return `${header}.${body}.${signature}`;
}

const mockObs: ObservabilityConfig = {
  loggerOptions: { level: "silent" },
  stream: {} as unknown as ObservabilityConfig["stream"],
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn().mockReturnThis(),
  } as unknown as ObservabilityConfig["logger"],
  shutdown: () => {},
};

const mockPrisma = {
  quizAttempt: {
    findMany: vi.fn().mockResolvedValue([
      {
        id: "att_1",
        nodeId: "quiz_k8s_1",
        score: 4,
        total: 5,
        passed: false,
        createdAt: new Date(),
        answers: {},
        node: { id: "quiz_k8s_1", title: "Kubernetes Basics Quiz" },
      },
    ]),
    create: vi.fn().mockResolvedValue({ id: "att_new" }),
  },
  challengeList: {
    findMany: vi.fn().mockResolvedValue([
      {
        id: "list_1",
        name: "Blind 75 DevOps",
        description: "Essential interview challenges",
        isPublic: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        items: [],
      },
    ]),
    findUnique: vi.fn().mockImplementation(({ where }: any) => {
      if (where.userId_name) return Promise.resolve(null);
      if (where.id === "list_1") {
        return Promise.resolve({
          id: "list_1",
          userId: "user_1",
          name: "Blind 75 DevOps",
          description: "Essential",
          isPublic: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          user: { id: "user_1", name: "Alice", username: "alice" },
          items: [],
        });
      }
      return Promise.resolve(null);
    }),
    create: vi.fn().mockResolvedValue({
      id: "list_new",
      userId: "user_1",
      name: "SRE Incidents",
      isPublic: false,
    }),
    delete: vi.fn().mockResolvedValue({}),
  },
  challengeListItem: {
    count: vi.fn().mockResolvedValue(0),
    upsert: vi.fn().mockResolvedValue({ id: "item_1", listId: "list_1", challengeId: "c1" }),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
  },
  node: {
    findFirst: vi.fn().mockResolvedValue({ id: "quiz_k8s_1", title: "Kubernetes Basics Quiz", type: "QUIZ" }),
  },
  challenge: {
    findUnique: vi.fn().mockResolvedValue({ id: "c1", title: "Nginx Fix" }),
  },
  user: {
    findUnique: vi.fn().mockResolvedValue({ id: "user_1", name: "Alice", username: "alice", role: "LEARNER" }),
  },
  learningPath: {
    findMany: vi.fn().mockResolvedValue([]),
  },
  $transaction: vi.fn((arg: unknown) => {
    if (Array.isArray(arg)) return Promise.all(arg);
    if (typeof arg === "function") return (arg as (client: unknown) => unknown)(mockPrisma);
    return Promise.resolve(arg);
  }),
  $connect: vi.fn().mockResolvedValue(undefined),
  $disconnect: vi.fn().mockResolvedValue(undefined),
};

vi.mock("@devops/db", () => ({
  PrismaClient: class {
    constructor() {
      return mockPrisma as any;
    }
  },
  createTenantClient: vi.fn((client: unknown) => client),
}));

vi.mock("@devops/messaging", () => ({
  MessagingService: class {
    initProducer = vi.fn().mockResolvedValue(undefined);
    disconnect = vi.fn().mockResolvedValue(undefined);
    emit = vi.fn().mockResolvedValue(undefined);
    consume = vi.fn().mockResolvedValue(undefined);
  },
  RabbitMQService: class {
    init = vi.fn().mockResolvedValue(undefined);
    disconnect = vi.fn().mockResolvedValue(undefined);
    publish = vi.fn().mockResolvedValue(undefined);
    consume = vi.fn().mockResolvedValue(undefined);
  },
  SessionStartedEvent: class {},
  SessionEndedEvent: class {},
  SessionEndReason: { EXPIRED: "EXPIRED", TERMINATED: "TERMINATED" },
  QUEUES: { TERMINATE_SANDBOX: "terminate_sandbox" },
  GROUPS: { PROGRESS: "progress" },
  TOPICS: { CHALLENGE_SOLVED: "challenge.solved" },
}));

describe("Personal Learning Tools: Quiz History & Custom Lists", () => {
  let app: any;

  beforeAll(async () => {
    const { buildApp } = await import("../app");
    app = await buildApp({
      jwtPublicKey: testPublicKey,
      sessionTTLMins: 60,
      ...mockObs,
    });
  });

  it("GET /quizzes/history returns learner's recent quiz attempts", async () => {
    const token = signTestToken({ sub: "user_1", role: "LEARNER" });
    const res = await app.inject({
      method: "GET",
      url: "/api/quizzes/history",
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.payload);
    expect(Array.isArray(json.attempts)).toBe(true);
    expect(json.attempts[0].quizTitle).toBe("Kubernetes Basics Quiz");
  });

  it("GET /lists returns learner's custom challenge collections", async () => {
    const token = signTestToken({ sub: "user_1", role: "LEARNER" });
    const res = await app.inject({
      method: "GET",
      url: "/api/lists",
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.payload);
    expect(Array.isArray(json.lists)).toBe(true);
    expect(json.lists[0].name).toBe("Blind 75 DevOps");
  });

  it("POST /lists creates a new custom challenge list", async () => {
    const token = signTestToken({ sub: "user_1", role: "LEARNER" });
    const res = await app.inject({
      method: "POST",
      url: "/api/lists",
      headers: { Authorization: `Bearer ${token}` },
      payload: { name: "SRE Incidents", isPublic: false },
    });

    expect(res.statusCode).toBe(201);
    const json = JSON.parse(res.payload);
    expect(json.name).toBe("SRE Incidents");
  });

  it("POST /lists/:id/items adds a challenge to list", async () => {
    const token = signTestToken({ sub: "user_1", role: "LEARNER" });
    const res = await app.inject({
      method: "POST",
      url: "/api/lists/list_1/items",
      headers: { Authorization: `Bearer ${token}` },
      payload: { challengeId: "c1" },
    });

    expect(res.statusCode).toBe(201);
  });
});
