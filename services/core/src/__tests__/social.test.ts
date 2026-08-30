import { describe, it, expect, vi, beforeAll } from "vitest";
import type { ObservabilityConfig } from "@devops/observability";
import { generateKeyPairSync, createSign } from "crypto";

// Generate test RSA key pair
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
  shareToken: {
    findUnique: vi.fn().mockImplementation(({ where }: any) => {
      if (where.token === "valid_token_123") {
        return Promise.resolve({
          token: "valid_token_123",
          type: "CHALLENGE_SOLVE",
          createdAt: new Date(),
          views: 5,
          user: { id: "user_1", name: "Alice", username: "alice", avatarUrl: null, jobTitle: "SRE", xp: 1000, currentStreak: 3 },
          challenge: { id: "c1", title: "Nginx Fix", difficulty: "JUNIOR", category: "DOCKER", xp: 100, tags: ["nginx"] },
          metadata: { verifiedChecks: [{ checkId: "check_1", status: "PASSED", message: "Port 80 reachable" }] },
        });
      }
      return Promise.resolve(null);
    }),
    create: vi.fn().mockResolvedValue({
      token: "generated_token_999",
      type: "CHALLENGE_SOLVE",
      createdAt: new Date(),
    }),
    update: vi.fn().mockResolvedValue({}),
  },
  challengeComment: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue({ id: "comm_1", challengeId: "c1", userId: "user_1" }),
    create: vi.fn().mockResolvedValue({
      id: "comm_new",
      challengeId: "c1",
      content: "Great lab!",
      isPinned: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      user: { id: "user_1", name: "Alice", username: "alice", avatarUrl: null, jobTitle: "SRE", role: "LEARNER" },
    }),
    delete: vi.fn().mockResolvedValue({}),
  },
  commentVote: {
    findUnique: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([{ vote: 1 }]),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
  },
  challenge: {
    findUnique: vi.fn().mockResolvedValue({ id: "c1", title: "Nginx Fix", difficulty: "JUNIOR", category: "DOCKER", xp: 100 }),
    findMany: vi.fn().mockResolvedValue([]),
  },
  challengeCheckResult: {
    findMany: vi.fn().mockResolvedValue([]),
  },
  completion: {
    findUnique: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
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

describe("Social Features & Engagement Routes", () => {
  let app: any;

  beforeAll(async () => {
    const { buildApp } = await import("../app");
    app = await buildApp({
      jwtPublicKey: testPublicKey,
      sessionTTLMins: 60,
      ...mockObs,
    });
  });

  it("GET /shares/unknown_token returns 404 NOT_FOUND", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/shares/non_existent_token_12345",
    });

    expect(res.statusCode).toBe(404);
    const json = JSON.parse(res.payload);
    expect(json.code).toBe("NOT_FOUND");
  });

  it("GET /shares/:token returns verified proof data for valid token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/shares/valid_token_123",
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.payload);
    expect(json.isVerified).toBe(true);
    expect(json.solver.username).toBe("alice");
    expect(json.seal.issuer).toBe("DevOps.lab Platform Verification Authority");
  });

  it("GET /challenges/:id/comments returns empty comments list", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/challenges/c1/comments",
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.payload);
    expect(Array.isArray(json.comments)).toBe(true);
  });

  it("POST /challenges/:id/comments creates new comment when authenticated", async () => {
    const token = signTestToken({ sub: "user_1", role: "LEARNER" });
    const res = await app.inject({
      method: "POST",
      url: "/api/challenges/c1/comments",
      headers: { Authorization: `Bearer ${token}` },
      payload: { content: "Great lab! Cleaned up the port binding." },
    });

    expect(res.statusCode).toBe(201);
    const json = JSON.parse(res.payload);
    expect(json.content).toBe("Great lab!");
    expect(json.author.username).toBe("alice");
  });

  it("POST /comments/:id/vote records user upvote", async () => {
    const token = signTestToken({ sub: "user_1", role: "LEARNER" });
    const res = await app.inject({
      method: "POST",
      url: "/api/comments/comm_1/vote",
      headers: { Authorization: `Bearer ${token}` },
      payload: { vote: 1 },
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.payload);
    expect(json.score).toBe(1);
  });
});
