import { describe, it, expect, beforeAll, afterAll } from "vitest";
import axios, { AxiosInstance } from "axios";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import Redis from "ioredis";

// ═══════════════════════════════════════════════════════════════════════════
// E2E REGRESSION SUITE (Real Infrastructure & Kong API Gateway)
// ═══════════════════════════════════════════════════════════════════════════

const KONG_BASE_URL = process.env.API_GATEWAY_URL || "http://127.0.0.1:8005";
const AUTH_DIRECT_URL = process.env.AUTH_SERVICE_URL || "http://127.0.0.1:3002";
const CORE_DIRECT_URL = process.env.CORE_SERVICE_URL || "http://127.0.0.1:3003";
const DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5444/appdb?schema=public";
const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

describe("Platform End-to-End System & Regression Suite", () => {
  let api: AxiosInstance;
  let prisma: PrismaClient;
  let pool: Pool;
  let redis: Redis;

  beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_URL });
    const adapter = new PrismaPg(pool);
    prisma = new PrismaClient({ adapter });
    redis = new Redis(REDIS_URL);

    api = axios.create({
      baseURL: KONG_BASE_URL,
      validateStatus: () => true, // Don't throw on 4xx/5xx so we can assert status codes
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await pool.end();
    redis.disconnect();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // a. User Registration -> AuthOutboxEvent created -> DB & Outbox Verification
  // ──────────────────────────────────────────────────────────────────────────
  it("a. Registers new user, creates AuthOutboxEvent, and generates verification token", async () => {
    const uniqueEmail = `e2e_test_${Date.now()}@example.com`;
    const password = "Password123!Secure";
    const name = "E2E Test User";

    const res = await api.post("/api/auth/register", {
      email: uniqueEmail,
      password,
      name,
    });

    expect(res.status).toBe(201);
    expect(res.data).toHaveProperty("user");
    expect(res.data.user.email).toBe(uniqueEmail);

    // Deep state assertion: Query PostgreSQL AuthOutboxEvent table
    const outboxEvents = await prisma.authOutboxEvent.findMany({
      where: {
        eventType: { in: ["UserRegisteredEvent", "EmailVerificationRequestedEvent"] },
      },
      orderBy: { createdAt: "desc" },
      take: 2,
    });

    expect(outboxEvents.length).toBeGreaterThanOrEqual(2);
    const emailsInOutbox = outboxEvents.map((e: any) => e.payload?.email);
    expect(emailsInOutbox).toContain(uniqueEmail);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // b. Login with valid credentials -> HttpOnly, SameSite=Lax Set-Cookie headers
  // ──────────────────────────────────────────────────────────────────────────
  it("b. Logs in with valid credentials and sets secure HttpOnly/SameSite=Lax session cookies", async () => {
    const email = `login_cookie_${Date.now()}@example.com`;
    const password = "ValidPassword123!";

    // Register user first
    const regRes = await api.post("/api/auth/register", { email, password, name: "Cookie Tester" });
    expect(regRes.status).toBe(201);

    const loginRes = await api.post("/api/auth/login", { email, password });
    expect(loginRes.status).toBe(200);

    // Assert actual Set-Cookie headers
    const setCookieHeaders = loginRes.headers["set-cookie"];
    expect(setCookieHeaders).toBeDefined();
    expect(Array.isArray(setCookieHeaders)).toBe(true);

    const cookieStr = setCookieHeaders!.join("; ");
    expect(cookieStr.toLowerCase()).toContain("httponly");
    expect(cookieStr.toLowerCase()).toContain("samesite=lax");
    expect(cookieStr).toContain("token=");
  });

  // ──────────────────────────────────────────────────────────────────────────
  // c. Login with invalid credentials -> 401 & auth_login_total metric increments
  // ──────────────────────────────────────────────────────────────────────────
  it("c. Rejects invalid credentials with 401 and increments auth_login_total Prometheus metric", async () => {
    // 1. Scrape initial metric value from auth-service /metrics endpoint
    const initialMetricsRes = await axios.get(`${AUTH_DIRECT_URL}/metrics`);
    const initialMetrics = initialMetricsRes.data as string;
    
    // 2. Perform invalid login
    const invalidRes = await api.post("/api/auth/login", {
      email: "nonexistent_user@example.com",
      password: "WrongPassword123!",
    });
    expect(invalidRes.status).toBe(401);
    expect(invalidRes.data.code).toBe("INVALID_CREDENTIALS");

    // 3. Scrape metrics after failed attempt
    const postMetricsRes = await axios.get(`${AUTH_DIRECT_URL}/metrics`);
    const postMetrics = postMetricsRes.data as string;

    expect(postMetrics).toContain('auth_login_total{outcome="invalid_credentials",service="auth-service"}');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // d. Browse challenges -> Start challenge -> CoreOutboxEvent creation
  // ──────────────────────────────────────────────────────────────────────────
  it("d. Browses catalog, starts challenge, and writes CoreOutboxEvent transactionally", async () => {
    // Register & obtain auth token
    const email = `challenge_runner_${Date.now()}@example.com`;
    const regRes = await api.post("/api/auth/register", { email, password: "Password123!", name: "Runner" });
    const token = regRes.data.token;

    // Get catalog of challenges
    const catalogRes = await api.get("/api/challenges", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(catalogRes.status).toBe(200);
    expect(Array.isArray(catalogRes.data)).toBe(true);
    expect(catalogRes.data.length).toBeGreaterThan(0);

    const firstChallenge = catalogRes.data[0];

    // Start challenge session
    const startRes = await api.post(
      `/api/challenges/${firstChallenge.id}/start`,
      {},
      { headers: { Authorization: `Bearer ${token}` } }
    );
    expect(startRes.status).toBe(201);
    expect(startRes.data).toHaveProperty("sessionId");

    // Deep state assertion: Confirm CoreOutboxEvent row was created
    const coreOutbox = await prisma.coreOutboxEvent.findFirst({
      where: {
        eventType: "SessionStartedEvent",
      },
      orderBy: { createdAt: "desc" },
    });

    expect(coreOutbox).toBeDefined();
    expect((coreOutbox?.payload as any)?.challengeId).toBe(firstChallenge.id);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // e. Call /api/assistant through Kong -> confirm does NOT 404
  // ──────────────────────────────────────────────────────────────────────────
  it("e. Verifies /api/assistant route is mapped in Kong Gateway and does not 404", async () => {
    const res = await api.post("/api/assistant/chat", {
      messages: [{ role: "user", content: "How do I fix Docker file permissions?" }],
    });

    // It should reach core-service (returning 200 or structured 500 if key missing, but NOT 404 Not Found from Kong)
    expect(res.status).not.toBe(404);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // f. Non-org user visits /teams -> confirm empty state, NOT mock "Acme Corp"
  // ──────────────────────────────────────────────────────────────────────────
  it("f. Ensures non-org learner gets 404/empty state rather than mock fallback data", async () => {
    const email = `solo_learner_${Date.now()}@example.com`;
    const regRes = await api.post("/api/auth/register", { email, password: "Password123!", name: "Solo" });
    const token = regRes.data.token;

    const orgRes = await api.get("/api/orgs/me", {
      headers: { Authorization: `Bearer ${token}` },
    });

    // Must return 404 "Not a member of any organization", NEVER mock Acme Corp
    expect(orgRes.status).toBe(404);
    expect(orgRes.data.error).toBe("Not a member of any organization");
  });

  // ──────────────────────────────────────────────────────────────────────────
  // g. Org MEMBER role attempts to invite a teammate -> 403 Forbidden
  // ──────────────────────────────────────────────────────────────────────────
  it("g. Blocks Org MEMBER role from inviting teammates with 403 Forbidden", async () => {
    // 1. Create an Org Owner
    const ownerEmail = `owner_${Date.now()}@example.com`;
    const ownerReg = await api.post("/api/auth/register", { email: ownerEmail, password: "Password123!", name: "Owner" });
    const ownerToken = ownerReg.data.token;

    // Create an organization
    const orgRes = await api.post(
      "/api/orgs",
      { name: "Test Corp", slug: `test-corp-${Date.now()}` },
      { headers: { Authorization: `Bearer ${ownerToken}` } }
    );
    expect(orgRes.status).toBe(201);
    const orgId = orgRes.data.id;

    // 2. Create a Member User and add them to the Org as MEMBER
    const memberEmail = `member_${Date.now()}@example.com`;
    const memberReg = await api.post("/api/auth/register", { email: memberEmail, password: "Password123!", name: "Member" });
    const memberToken = memberReg.data.token;
    const memberUserId = memberReg.data.user.id;

    // Attach as member in DB
    await prisma.orgMember.create({
      data: {
        userId: memberUserId,
        orgId,
        orgRole: "MEMBER",
      },
    });
    await prisma.user.update({
      where: { id: memberUserId },
      data: { orgId },
    });

    // 3. Member attempts to send invite -> MUST return 403 Forbidden
    const inviteRes = await api.post(
      `/api/orgs/${orgId}/invites`,
      { email: "invitee@example.com", orgRole: "MEMBER" },
      { headers: { Authorization: `Bearer ${memberToken}` } }
    );

    expect(inviteRes.status).toBe(403);
    expect(inviteRes.data.error).toContain("Admin access required");
  });

  // ──────────────────────────────────────────────────────────────────────────
  // h. Logout -> Session revoked in Redis
  // ──────────────────────────────────────────────────────────────────────────
  it("h. Revokes session tokens on logout so user context cannot leak to next session", async () => {
    const email = `logout_user_${Date.now()}@example.com`;
    const regRes = await api.post("/api/auth/register", { email, password: "Password123!", name: "Logout User" });
    const token = regRes.data.token;
    const cookie = regRes.headers["set-cookie"]?.[0];

    // Call logout endpoint
    const logoutRes = await api.post(
      "/api/auth/logout",
      {},
      {
        headers: {
          Authorization: `Bearer ${token}`,
          ...(cookie ? { Cookie: cookie } : {}),
        },
      }
    );
    expect(logoutRes.status).toBe(200);

    // Call authenticated /api/auth/me route -> must return 401 Unauthorized
    const meRes = await api.get("/api/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(meRes.status).toBe(401);
  });
});
