import { describe, it, expect, beforeAll, afterAll } from "vitest";
import axios, { AxiosInstance } from "axios";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import Redis from "ioredis";

const KONG_BASE_URL = process.env.API_GATEWAY_URL || "http://127.0.0.1:8005";
const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@127.0.0.1:5444/appdb?schema=public";
const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

async function registerUser(
  api: AxiosInstance,
  prefix = "user"
): Promise<{ token: string; userId: string; email: string; cookie: string }> {
  const email = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}@e2e.test`;
  const res = await api.post("/api/auth/register", {
    email,
    password: "Password123!Secure",
    name: "E2E Extended",
  });
  expect(res.status, `register failed for ${email}: ${JSON.stringify(res.data)}`).toBe(201);
  return {
    token: res.data.token as string,
    userId: res.data.user.id as string,
    email,
    cookie: (res.headers["set-cookie"] ?? []).join("; "),
  };
}

describe("Extended Platform E2E Suite", () => {
  let api: AxiosInstance;
  let prisma: PrismaClient;
  let pool: Pool;
  let redis: Redis;

  beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_URL });
    const adapter = new PrismaPg(pool);
    prisma = new PrismaClient({ adapter });
    redis = new Redis(REDIS_URL);
    api = axios.create({ baseURL: KONG_BASE_URL, validateStatus: () => true });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await pool.end();
    redis.disconnect();
  });

  // ── GROUP 1: REGISTRATION EDGE CASES ─────────────────────────────────────

  describe("1. Registration edge cases", () => {
    it("1a. Rejects duplicate email with 400 USER_EXISTS; only one DB row created", async () => {
      const email = `dup_${Date.now()}@e2e.test`;
      const first = await api.post("/api/auth/register", { email, password: "Password123!", name: "First" });
      expect(first.status).toBe(201);

      const second = await api.post("/api/auth/register", { email, password: "AnotherPass456!", name: "Dup" });
      expect(second.status).toBe(400);
      expect(second.data.code).toBe("USER_EXISTS");

      const count = await prisma.user.count({ where: { email } });
      expect(count).toBe(1);
    });

    it("1b. Account locked after 5 failed logins (429); Redis lockout key present", async () => {
      const { email } = await registerUser(api, "lockout");

      for (let i = 0; i < 5; i++) {
        const r = await api.post("/api/auth/login", { email, password: "WrongPassword!" });
        expect(r.status).toBe(401);
      }

      const locked = await api.post("/api/auth/login", { email, password: "WrongPassword!" });
      expect(locked.status).toBe(429);
      expect(locked.data.code).toBe("ACCOUNT_LOCKED");

      const correct = await api.post("/api/auth/login", { email, password: "Password123!Secure" });
      expect(correct.status).toBe(429);
      expect(correct.data.code).toBe("ACCOUNT_LOCKED");

      const lockoutKey = await redis.get(`auth:lockout:${email}`);
      expect(lockoutKey).toBe("1");
    });
  });

  // ── GROUP 2: EMAIL VERIFICATION ───────────────────────────────────────────

  describe("2. Email verification flow", () => {
    it("2a. Verification token stored in Redis after registration", async () => {
      const { email, userId } = await registerUser(api, "verify");

      const outboxRow = await prisma.authOutboxEvent.findFirst({
        where: { eventType: "EmailVerificationRequestedEvent", payload: { path: ["email"], equals: email } },
        orderBy: { createdAt: "desc" },
      });
      expect(outboxRow).not.toBeNull();

      const verToken = (outboxRow!.payload as any).token as string;
      expect(typeof verToken).toBe("string");

      const redisValue = await redis.get(`auth:verify-email:${verToken}`);
      expect(redisValue).toBe(userId);
    });

    it("2b. Valid token sets emailVerified; Redis key consumed", async () => {
      const { email } = await registerUser(api, "verifyconfirm");

      const outboxRow = await prisma.authOutboxEvent.findFirst({
        where: { eventType: "EmailVerificationRequestedEvent", payload: { path: ["email"], equals: email } },
        orderBy: { createdAt: "desc" },
      });
      const verToken = (outboxRow!.payload as any).token as string;

      const res = await api.post("/api/auth/verify-email", { token: verToken });
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);

      const user = await prisma.user.findUnique({ where: { email } });
      expect(user?.emailVerified).not.toBeNull();

      const redisGone = await redis.get(`auth:verify-email:${verToken}`);
      expect(redisGone).toBeNull();
    });

    it("2c. Invalid token returns 400 INVALID_VERIFICATION_TOKEN", async () => {
      const res = await api.post("/api/auth/verify-email", { token: "totally-fake-00000000-0000-0000-0000-000000000000" });
      expect(res.status).toBe(400);
      expect(res.data.code).toBe("INVALID_VERIFICATION_TOKEN");
    });
  });

  // ── GROUP 3: FORGOT/RESET PASSWORD ───────────────────────────────────────

  describe("3. Forgot/reset password flow", () => {
    it("3a. Forgot-password returns 200 for unknown email (no enumeration)", async () => {
      const res = await api.post("/api/auth/forgot-password", { email: "ghost@nowhere.test" });
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
    });

    it("3b. Forgot-password creates PasswordResetRequestedEvent and Redis key for real user", async () => {
      const { email, userId } = await registerUser(api, "forgot");
      await api.post("/api/auth/forgot-password", { email });

      const outbox = await prisma.authOutboxEvent.findFirst({
        where: { eventType: "PasswordResetRequestedEvent", payload: { path: ["userId"], equals: userId } },
        orderBy: { createdAt: "desc" },
      });
      expect(outbox).not.toBeNull();

      const resetToken = (outbox!.payload as any).token as string;
      const redisValue = await redis.get(`auth:reset-password:${resetToken}`);
      expect(redisValue).toBe(userId);
    });

    it("3c. Valid reset token updates password; old password fails, new succeeds; Redis key consumed", async () => {
      const { email, userId } = await registerUser(api, "reset");
      await api.post("/api/auth/forgot-password", { email });

      const outbox = await prisma.authOutboxEvent.findFirst({
        where: { eventType: "PasswordResetRequestedEvent", payload: { path: ["userId"], equals: userId } },
        orderBy: { createdAt: "desc" },
      });
      const resetToken = (outbox!.payload as any).token as string;

      const newPassword = "NewSecure999!";
      const resetRes = await api.post("/api/auth/reset-password", { token: resetToken, newPassword });
      expect(resetRes.status).toBe(200);
      expect(resetRes.data.success).toBe(true);

      expect(await redis.get(`auth:reset-password:${resetToken}`)).toBeNull();

      const newLogin = await api.post("/api/auth/login", { email, password: newPassword });
      expect(newLogin.status).toBe(200);

      const oldLogin = await api.post("/api/auth/login", { email, password: "Password123!Secure" });
      expect(oldLogin.status).toBe(401);
    });

    it("3d. Invalid reset token returns 400 INVALID_RESET_TOKEN", async () => {
      const res = await api.post("/api/auth/reset-password", {
        token: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        newPassword: "DoesntMatter123!",
      });
      expect(res.status).toBe(400);
      expect(res.data.code).toBe("INVALID_RESET_TOKEN");
    });
  });

  // ── GROUP 4: ACCOUNT LIFECYCLE ────────────────────────────────────────────

  describe("4. Authenticated account lifecycle", () => {
    it("4a. GET /api/auth/me returns profile; password hash never exposed", async () => {
      const { token, userId, email } = await registerUser(api, "getme");
      const res = await api.get("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } });
      expect(res.status).toBe(200);
      expect(res.data.id).toBe(userId);
      expect(res.data.email).toBe(email);
      expect(res.data).toHaveProperty("role");
      expect(res.data).toHaveProperty("xp");
      expect(res.data.password).toBeUndefined();
    });

    it("4b. PUT /api/auth/me updates name and jobTitle; persists on re-fetch", async () => {
      const { token } = await registerUser(api, "putme");
      const res = await api.put("/api/auth/me", { name: "Updated Name", jobTitle: "DevOps Engineer" }, { headers: { Authorization: `Bearer ${token}` } });
      expect(res.status).toBe(200);
      expect(res.data.user.name).toBe("Updated Name");

      const meRes = await api.get("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } });
      expect(meRes.data.name).toBe("Updated Name");
      expect(meRes.data.jobTitle).toBe("DevOps Engineer");
    });

    it("4c. change-password: old password fails; new password succeeds", async () => {
      const { email, token } = await registerUser(api, "chpwd");
      const changeRes = await api.post("/api/auth/change-password", {
        currentPassword: "Password123!Secure",
        newPassword: "BrandNew999!Pass",
      }, { headers: { Authorization: `Bearer ${token}` } });
      expect(changeRes.status).toBe(200);

      expect((await api.post("/api/auth/login", { email, password: "Password123!Secure" })).status).toBe(401);
      expect((await api.post("/api/auth/login", { email, password: "BrandNew999!Pass" })).status).toBe(200);
    });

    it("4c-err. Wrong current password returns 401 INCORRECT_PASSWORD", async () => {
      const { token } = await registerUser(api, "chpwderr");
      const res = await api.post("/api/auth/change-password", {
        currentPassword: "TotallyWrong!",
        newPassword: "NewPass123!",
      }, { headers: { Authorization: `Bearer ${token}` } });
      expect(res.status).toBe(401);
      expect(res.data.code).toBe("INCORRECT_PASSWORD");
    });

    it("4d. DELETE /api/auth/me removes user from DB; UserDeletedEvent created; 401 after", async () => {
      const { token, userId } = await registerUser(api, "delme");
      const deleteRes = await api.delete("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } });
      expect(deleteRes.status).toBe(200);

      expect(await prisma.user.findUnique({ where: { id: userId } })).toBeNull();

      const outbox = await prisma.authOutboxEvent.findFirst({
        where: { eventType: "UserDeletedEvent", payload: { path: ["userId"], equals: userId } },
      });
      expect(outbox).not.toBeNull();

      const meRes = await api.get("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } });
      expect(meRes.status).toBe(401);
    });
  });

  // ── GROUP 5: TOKEN REFRESH ────────────────────────────────────────────────

  describe("5. Token refresh rotation", () => {
    it("5a. Valid refreshToken cookie issues new session (200 or 201)", async () => {
      const { email } = await registerUser(api, "refresh");
      const loginRes = await api.post("/api/auth/login", { email, password: "Password123!Secure" });
      expect(loginRes.status).toBe(200);

      const cookieStr = (loginRes.headers["set-cookie"] ?? []).join("; ");
      const refreshRes = await api.post("/api/auth/refresh", {}, { headers: { Cookie: cookieStr } });
      expect([200, 201]).toContain(refreshRes.status);
    });

    it("5b. Missing refreshToken cookie returns 401 REFRESH_TOKEN_MISSING", async () => {
      const res = await api.post("/api/auth/refresh", {});
      expect(res.status).toBe(401);
      expect(res.data.code).toBe("REFRESH_TOKEN_MISSING");
    });
  });

  // ── GROUP 6: LOGOUT-ALL ───────────────────────────────────────────────────

  describe("6. Logout-all sessions", () => {
    it("6a. logout-all denylists tokens; old token returns 401", async () => {
      const { token, email } = await registerUser(api, "logoutall");
      const loginRes = await api.post("/api/auth/login", { email, password: "Password123!Secure" });
      expect(loginRes.status).toBe(200);

      const logoutAllRes = await api.post("/api/auth/logout-all", {}, { headers: { Authorization: `Bearer ${loginRes.data.token}` } });
      expect(logoutAllRes.status).toBe(200);

      const meRes = await api.get("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } });
      expect(meRes.status).toBe(401);
    });
  });

  // ── GROUP 7: SECURITY LOG & SESSIONS ─────────────────────────────────────

  describe("7. Security log and session management", () => {
    it("7a. Security log contains REGISTER event", async () => {
      const { token } = await registerUser(api, "seclog");
      const res = await api.get("/api/auth/security-log", { headers: { Authorization: `Bearer ${token}` } });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data.logs)).toBe(true);
      expect(res.data.logs.map((l: any) => l.action)).toContain("REGISTER");
    });

    it("7b. Sessions endpoint returns array", async () => {
      const { email } = await registerUser(api, "sessions");
      const loginRes = await api.post("/api/auth/login", { email, password: "Password123!Secure" });
      expect(loginRes.status).toBe(200);
      const res = await api.get("/api/auth/sessions", { headers: { Authorization: `Bearer ${loginRes.data.token}` } });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data)).toBe(true);
    });
  });

  // ── GROUP 8: CORE — DASHBOARD, PROFILE, HISTORY ───────────────────────────

  describe("8. User dashboard (core-service)", () => {
    it("8a. Dashboard returns structured payload for fresh user; xp=0, hasActivity=false", async () => {
      const { token } = await registerUser(api, "dash");
      const res = await api.get("/api/me/dashboard", { headers: { Authorization: `Bearer ${token}` } });
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty("hasActivity");
      expect(res.data).toHaveProperty("stats");
      expect(res.data).toHaveProperty("inProgress");
      expect(res.data).toHaveProperty("recommendedNext");
      expect(res.data).toHaveProperty("recentBadges");
      expect(res.data).toHaveProperty("todayChallenge");
      expect(res.data.hasActivity).toBe(false);
      expect(res.data.stats.xp).toBe(0);
    });

    it("8b. Dashboard without auth returns 401", async () => {
      expect((await api.get("/api/me/dashboard")).status).toBe(401);
    });

    it("8c. GET /api/me/profile returns correct user fields", async () => {
      const { token, userId, email } = await registerUser(api, "coreprofile");
      const res = await api.get("/api/me/profile", { headers: { Authorization: `Bearer ${token}` } });
      expect(res.status).toBe(200);
      expect(res.data.id).toBe(userId);
      expect(res.data.email).toBe(email);
      expect(res.data).toHaveProperty("xp");
      expect(res.data).toHaveProperty("badges");
    });

    it("8d. PUT /api/me/profile updates name and jobTitle", async () => {
      const { token } = await registerUser(api, "coreupdate");
      const res = await api.put("/api/me/profile", { name: "Core Updated", jobTitle: "SRE" }, { headers: { Authorization: `Bearer ${token}` } });
      expect(res.status).toBe(200);
      expect(res.data.name).toBe("Core Updated");
      expect(res.data.jobTitle).toBe("SRE");
    });

    it("8e. GET /api/me/history returns array", async () => {
      const { token } = await registerUser(api, "history");
      const res = await api.get("/api/me/history", { headers: { Authorization: `Bearer ${token}` } });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data)).toBe(true);
    });
  });

  // ── GROUP 9: LEADERBOARD ─────────────────────────────────────────────────

  describe("9. Leaderboard", () => {
    it("9a. Global leaderboard is public and returns correct shape", async () => {
      const res = await api.get("/api/leaderboard");
      expect(res.status).toBe(200);
      expect(res.data.context).toBe("GLOBAL");
      expect(Array.isArray(res.data.leaderboard)).toBe(true);
    });

    it("9b. limit=5 returns at most 5 entries", async () => {
      const res = await api.get("/api/leaderboard?limit=5");
      expect(res.status).toBe(200);
      expect(res.data.leaderboard.length).toBeLessThanOrEqual(5);
    });

    it("9c. Org leaderboard returns 403 for non-member", async () => {
      const owner = await registerUser(api, "lbowner");
      const loginRes = await api.post("/api/auth/login", { email: owner.email, password: "Password123!Secure" });
      const ownerToken = loginRes.data.token;
      const orgRes = await api.post("/api/orgs", { name: "LB Corp", slug: `lb-corp-${Date.now()}` }, { headers: { Authorization: `Bearer ${ownerToken}` } });
      expect(orgRes.status).toBe(201);

      const outsider = await registerUser(api, "lboutsider");
      const res = await api.get(`/api/orgs/${orgRes.data.id}/leaderboard`, { headers: { Authorization: `Bearer ${outsider.token}` } });
      expect(res.status).toBe(403);
    });

    it("9d. Org member sees ranked leaderboard; OWNER present in results", async () => {
      const owner = await registerUser(api, "lbmember");
      const loginRes = await api.post("/api/auth/login", { email: owner.email, password: "Password123!Secure" });
      const ownerToken = loginRes.data.token;
      const orgRes = await api.post("/api/orgs", { name: "Ranked Corp", slug: `ranked-corp-${Date.now()}` }, { headers: { Authorization: `Bearer ${ownerToken}` } });
      expect(orgRes.status).toBe(201);
      const orgId = orgRes.data.id;

      const res = await api.get(`/api/orgs/${orgId}/leaderboard`, { headers: { Authorization: `Bearer ${ownerToken}` } });
      expect(res.status).toBe(200);
      expect(res.data.orgId).toBe(orgId);
      expect(Array.isArray(res.data.leaderboard)).toBe(true);
      const ownerEntry = res.data.leaderboard.find((u: any) => u.id === owner.userId);
      expect(ownerEntry).toBeDefined();
      expect(ownerEntry.orgRole).toBe("OWNER");
    });
  });

  // ── GROUP 10: SOCIAL COMMENTS ─────────────────────────────────────────────

  describe("10. Social comments on challenges", () => {
    async function getFirstChallengeId(token: string): Promise<string | null> {
      const res = await api.get("/api/challenges", { headers: { Authorization: `Bearer ${token}` } });
      if (res.status !== 200 || !Array.isArray(res.data) || !res.data.length) return null;
      return res.data[0].id as string;
    }

    it("10a. GET comments is public; returns correct shape", async () => {
      const { token } = await registerUser(api, "commentread");
      const id = await getFirstChallengeId(token);
      if (!id) { console.warn("No seeded challenges — skipping 10a"); return; }
      const res = await api.get(`/api/challenges/${id}/comments`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data.comments)).toBe(true);
    });

    it("10b. Authenticated POST comment appears in list with correct author and score=0", async () => {
      const { token, userId } = await registerUser(api, "commentpost");
      const id = await getFirstChallengeId(token);
      if (!id) { console.warn("No seeded challenges — skipping 10b"); return; }

      const content = `E2E test comment ${Date.now()}`;
      const postRes = await api.post(`/api/challenges/${id}/comments`, { content }, { headers: { Authorization: `Bearer ${token}` } });
      expect(postRes.status).toBe(201);
      expect(postRes.data.author.id).toBe(userId);
      expect(postRes.data.score).toBe(0);

      const listRes = await api.get(`/api/challenges/${id}/comments`, { headers: { Authorization: `Bearer ${token}` } });
      expect(listRes.data.comments.find((c: any) => c.id === postRes.data.id)).toBeDefined();
    });

    it("10c. POST comment without auth returns 401", async () => {
      const { token } = await registerUser(api, "commentauth");
      const id = await getFirstChallengeId(token);
      if (!id) { console.warn("No seeded challenges — skipping 10c"); return; }
      const res = await api.post(`/api/challenges/${id}/comments`, { content: "Unauthorized" });
      expect(res.status).toBe(401);
    });

    it("10d. Upvote increments score to 1", async () => {
      const author = await registerUser(api, "voteauthor");
      const voter = await registerUser(api, "voter");
      const id = await getFirstChallengeId(author.token);
      if (!id) { console.warn("No seeded challenges — skipping 10d"); return; }

      const commentRes = await api.post(`/api/challenges/${id}/comments`, { content: `Votable ${Date.now()}` }, { headers: { Authorization: `Bearer ${author.token}` } });
      expect(commentRes.status).toBe(201);

      const voteRes = await api.post(`/api/comments/${commentRes.data.id}/vote`, { vote: 1 }, { headers: { Authorization: `Bearer ${voter.token}` } });
      expect(voteRes.status).toBe(200);
      expect(voteRes.data.score).toBe(1);
      expect(voteRes.data.userVote).toBe(1);
    });

    it("10e. Author deletes own comment; DB row removed", async () => {
      const { token } = await registerUser(api, "commentdel");
      const id = await getFirstChallengeId(token);
      if (!id) { console.warn("No seeded challenges — skipping 10e"); return; }

      const postRes = await api.post(`/api/challenges/${id}/comments`, { content: `Delete me ${Date.now()}` }, { headers: { Authorization: `Bearer ${token}` } });
      expect(postRes.status).toBe(201);
      const commentId = postRes.data.id;

      const deleteRes = await api.delete(`/api/comments/${commentId}`, { headers: { Authorization: `Bearer ${token}` } });
      expect(deleteRes.status).toBe(200);
      expect(await prisma.challengeComment.findUnique({ where: { id: commentId } })).toBeNull();
    });

    it("10f. Non-author delete returns 403", async () => {
      const author = await registerUser(api, "comauthor");
      const stranger = await registerUser(api, "comstranger");
      const id = await getFirstChallengeId(author.token);
      if (!id) { console.warn("No seeded challenges — skipping 10f"); return; }

      const postRes = await api.post(`/api/challenges/${id}/comments`, { content: `Protected ${Date.now()}` }, { headers: { Authorization: `Bearer ${author.token}` } });
      expect(postRes.status).toBe(201);

      const deleteRes = await api.delete(`/api/comments/${postRes.data.id}`, { headers: { Authorization: `Bearer ${stranger.token}` } });
      expect(deleteRes.status).toBe(403);
    });

    it("10g. Reply has correct parentId in response", async () => {
      const { token } = await registerUser(api, "replytest");
      const id = await getFirstChallengeId(token);
      if (!id) { console.warn("No seeded challenges — skipping 10g"); return; }

      const parentRes = await api.post(`/api/challenges/${id}/comments`, { content: `Parent ${Date.now()}` }, { headers: { Authorization: `Bearer ${token}` } });
      expect(parentRes.status).toBe(201);

      const replyRes = await api.post(`/api/challenges/${id}/comments`, { content: `Reply ${Date.now()}`, parentId: parentRes.data.id }, { headers: { Authorization: `Bearer ${token}` } });
      expect(replyRes.status).toBe(201);
      expect(replyRes.data.parentId).toBe(parentRes.data.id);
    });
  });

  // ── GROUP 11: ORGANIZATION FULL LIFECYCLE ─────────────────────────────────

  describe("11. Organization full lifecycle", () => {
    it("11a. Create org: OWNER membership in DB; user.orgId updated", async () => {
      const owner = await registerUser(api, "orgcreate");
      const loginRes = await api.post("/api/auth/login", { email: owner.email, password: "Password123!Secure" });
      const ownerToken = loginRes.data.token;

      const slug = `org-lifecycle-${Date.now()}`;
      const orgRes = await api.post("/api/orgs", { name: "Lifecycle Corp", slug }, { headers: { Authorization: `Bearer ${ownerToken}` } });
      expect(orgRes.status).toBe(201);
      const orgId = orgRes.data.id;

      const membership = await prisma.orgMember.findUnique({ where: { userId_orgId: { userId: owner.userId, orgId } } });
      expect(membership).not.toBeNull();
      expect(membership!.orgRole).toBe("OWNER");

      const user = await prisma.user.findUnique({ where: { id: owner.userId } });
      expect(user!.orgId).toBe(orgId);
    });

    it("11b. Duplicate org slug returns 409", async () => {
      const owner = await registerUser(api, "orgslug");
      const loginRes = await api.post("/api/auth/login", { email: owner.email, password: "Password123!Secure" });
      const ownerToken = loginRes.data.token;
      const slug = `conflict-slug-${Date.now()}`;

      await api.post("/api/orgs", { name: "First", slug }, { headers: { Authorization: `Bearer ${ownerToken}` } });

      const owner2 = await registerUser(api, "orgslug2");
      const login2 = await api.post("/api/auth/login", { email: owner2.email, password: "Password123!Secure" });
      const res = await api.post("/api/orgs", { name: "Second", slug }, { headers: { Authorization: `Bearer ${login2.data.token}` } });
      expect(res.status).toBe(409);
    });

    it("11c. OWNER invite: DB row PENDING; org.invite.sent outbox event", async () => {
      const owner = await registerUser(api, "inviteowner");
      const loginRes = await api.post("/api/auth/login", { email: owner.email, password: "Password123!Secure" });
      const ownerToken = loginRes.data.token;

      const orgRes = await api.post("/api/orgs", { name: "Invite Corp", slug: `invite-corp-${Date.now()}` }, { headers: { Authorization: `Bearer ${ownerToken}` } });
      expect(orgRes.status).toBe(201);
      const orgId = orgRes.data.id;

      const inviteRes = await api.post(`/api/orgs/${orgId}/invites`, { email: `invitee_${Date.now()}@e2e.test`, orgRole: "MEMBER" }, { headers: { Authorization: `Bearer ${ownerToken}` } });
      expect(inviteRes.status).toBe(201);
      const inviteId = inviteRes.data.invite.id;

      const invite = await prisma.orgInvite.findUnique({ where: { id: inviteId } });
      expect(invite?.status).toBe("PENDING");

      const outbox = await prisma.coreOutboxEvent.findFirst({
        where: { eventType: "org.invite.sent", payload: { path: ["inviteId"], equals: inviteId } },
        orderBy: { createdAt: "desc" },
      });
      expect(outbox).not.toBeNull();
    });

    it("11d. Join via invite token: OrgMember MEMBER, invite ACCEPTED, org.member.joined outbox", async () => {
      const owner = await registerUser(api, "joinowner");
      const loginRes = await api.post("/api/auth/login", { email: owner.email, password: "Password123!Secure" });
      const ownerToken = loginRes.data.token;

      const orgRes = await api.post("/api/orgs", { name: "Joinable", slug: `joinable-${Date.now()}` }, { headers: { Authorization: `Bearer ${ownerToken}` } });
      expect(orgRes.status).toBe(201);
      const orgId = orgRes.data.id;

      const joiner = await registerUser(api, "joiner");
      const inviteRes = await api.post(`/api/orgs/${orgId}/invites`, { email: joiner.email, orgRole: "MEMBER" }, { headers: { Authorization: `Bearer ${ownerToken}` } });
      expect(inviteRes.status).toBe(201);
      const inviteToken: string = inviteRes.data.invite.token;
      const inviteId: string = inviteRes.data.invite.id;

      const joinRes = await api.post(`/api/orgs/join/${inviteToken}`, {}, { headers: { Authorization: `Bearer ${joiner.token}` } });
      expect(joinRes.status).toBe(200);

      const membership = await prisma.orgMember.findUnique({ where: { userId_orgId: { userId: joiner.userId, orgId } } });
      expect(membership?.orgRole).toBe("MEMBER");

      const invite = await prisma.orgInvite.findUnique({ where: { id: inviteId } });
      expect(invite?.status).toBe("ACCEPTED");

      const outbox = await prisma.coreOutboxEvent.findFirst({
        where: { eventType: "org.member.joined", payload: { path: ["userId"], equals: joiner.userId } },
        orderBy: { createdAt: "desc" },
      });
      expect(outbox).not.toBeNull();
    });

    it("11e. Reusing accepted invite token returns 400", async () => {
      const owner = await registerUser(api, "reuseowner");
      const loginRes = await api.post("/api/auth/login", { email: owner.email, password: "Password123!Secure" });
      const ownerToken = loginRes.data.token;

      const orgRes = await api.post("/api/orgs", { name: "Reuse Corp", slug: `reuse-${Date.now()}` }, { headers: { Authorization: `Bearer ${ownerToken}` } });
      expect(orgRes.status).toBe(201);
      const orgId = orgRes.data.id;

      const joiner = await registerUser(api, "reusejoiner");
      const inviteRes = await api.post(`/api/orgs/${orgId}/invites`, { email: joiner.email, orgRole: "MEMBER" }, { headers: { Authorization: `Bearer ${ownerToken}` } });
      const inviteToken: string = inviteRes.data.invite.token;

      await api.post(`/api/orgs/join/${inviteToken}`, {}, { headers: { Authorization: `Bearer ${joiner.token}` } });
      const second = await api.post(`/api/orgs/join/${inviteToken}`, {}, { headers: { Authorization: `Bearer ${joiner.token}` } });
      expect(second.status).toBe(400);
    });

    it("11f. GET /api/orgs/me returns org with OWNER myRole", async () => {
      const owner = await registerUser(api, "orgsme");
      const loginRes = await api.post("/api/auth/login", { email: owner.email, password: "Password123!Secure" });
      const ownerToken = loginRes.data.token;

      const slug = `orgsme-${Date.now()}`;
      await api.post("/api/orgs", { name: "OrgsMeCorp", slug }, { headers: { Authorization: `Bearer ${ownerToken}` } });

      const meRes = await api.get("/api/orgs/me", { headers: { Authorization: `Bearer ${ownerToken}` } });
      expect(meRes.status).toBe(200);
      expect(meRes.data.slug).toBe(slug);
      expect(meRes.data.myRole).toBe("OWNER");
    });
  });

  // ── GROUP 12: PROTECTED ROUTE GUARDS ─────────────────────────────────────

  describe("12. Protected route guards — 401 without token", () => {
    const routes = [
      "/api/auth/me",
      "/api/me/dashboard",
      "/api/me/profile",
      "/api/me/history",
      "/api/auth/security-log",
      "/api/auth/sessions",
    ];

    for (const path of routes) {
      it(`12. GET ${path} -> 401`, async () => {
        const res = await api.get(path);
        expect(res.status).toBe(401);
      });
    }
  });
});
