import { describe, it, expect, beforeAll } from "vitest";
import { z } from "zod";

const API_URL = process.env["API_GATEWAY_URL"] || "http://localhost:8005";
const AUTH_URL = `${API_URL}/api/auth`;
const CORE_URL = `${API_URL}/api`;

// --- STRICT ZOD SCHEMAS ---
const ChallengeSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  difficulty: z.string(),
  category: z.string(),
  tags: z.array(z.string()),
  xp: z.number(),
  module: z.object({
    title: z.string(),
  }).optional().nullable(),
});

const ChallengeListSchema = z.array(ChallengeSchema);

const StartSessionSchema = z.object({
  sessionId: z.string().uuid(),
  challengeId: z.string(),
  challengeTitle: z.string(),
  terminalUrl: z.string().url(),
  validateUrl: z.string().url(),
  ttlMins: z.number(),
});

const QuizQuestionSchema = z.object({
  id: z.string(),
  text: z.string(),
  options: z.array(z.string()),
  explanation: z.string().optional(),
});

const QuizSchema = z.object({
  id: z.string(),
  title: z.string(),
  metadata: z.object({
    slug: z.string().optional(),
    questions: z.array(QuizQuestionSchema),
  }).passthrough(),
});

const QuizListSchema = z.array(QuizSchema);

const QuizSubmitResultSchema = z.object({
  passed: z.boolean(),
  score: z.number(),
  total: z.number(),
  results: z.array(
    z.object({
      questionId: z.string(),
      correct: z.boolean(),
      userAnswer: z.number().nullable().optional(),
      explanation: z.string().optional(),
    })
  ),
});

const RoadmapSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  slug: z.string(),
  icon: z.string().optional(),
  nodeCount: z.number().optional(),
});

const RoadmapListSchema = z.array(RoadmapSchema);

const RoadmapProgressSchema = z.object({
  completedNodes: z.array(z.string()),
  inProgressNodes: z.array(z.string()),
});

const DashboardSchema = z.object({
  hasActivity: z.boolean(),
  todayChallenge: z.object({
    id: z.string(),
    title: z.string(),
    completedToday: z.boolean(),
  }),
  inProgress: z.array(z.any()),
  stats: z.object({
    xp: z.number(),
    streak: z.number(),
    roadmapsCompleted: z.number(),
    badgesEarned: z.number(),
  }),
  recommendedNext: z.object({
    title: z.string(),
    description: z.string(),
    link: z.string(),
  }),
  recentBadges: z.array(z.any()),
  recentActivity: z.array(z.any()),
  org: z.any().nullable().optional(),
});

const LeaderboardSchema = z.object({
  leaderboard: z.array(
    z.object({
      id: z.string(),
      name: z.string().nullable().optional(),
      xp: z.number(),
    })
  ),
});

const OrgSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  planTier: z.string(),
});

const OrgMemberSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  orgRole: z.string(),
  status: z.string(),
  score: z.number(),
});

const OrgAnalyticsSchema = z.object({
  totalEngineers: z.number(),
  activeSandboxes: z.number(),
  avgSkillScore: z.number(),
  pathsCompleted: z.number(),
});

describe("Core Service Integration Tests (via API Gateway)", () => {
  let authToken: string;
  let testUserId: string;
  let testUserEmail: string;
  let challengeId: string;
  let quizSlug: string;

  beforeAll(async () => {
    // Register a fresh test user via Auth Service through Gateway
    testUserEmail = `core-integration-${Date.now()}@example.com`;
    const regRes = await fetch(`${AUTH_URL}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: testUserEmail,
        password: "IntegrationTest123!",
        name: "Core Integration User",
      }),
    });

    expect([200, 201]).toContain(regRes.status);
    const regData = (await regRes.json()) as { token: string; user: { id: string; email: string } };
    authToken = regData.token;
    testUserId = regData.user.id;
    expect(authToken).toBeDefined();
    expect(testUserId).toBeDefined();
  });

  // 1. GET /api/challenges
  it("GET /api/challenges — lists challenges with correct data shape and seed content", async () => {
    const res = await fetch(`${CORE_URL}/challenges`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    const challenges = ChallengeListSchema.parse(data);
    expect(challenges.length).toBeGreaterThan(0);

    const firstChallenge = challenges[0];
    expect(firstChallenge).toBeDefined();
    challengeId = firstChallenge!.id;
    expect(challengeId).toBeDefined();

    // Check seed challenge titles exist
    const titles = challenges.map((c) => c.title);
    expect(titles.some((t) => t.includes("SSH") || t.includes("Linux") || t.includes("Nginx"))).toBe(true);
  });

  // 2. GET /api/challenges/:id
  it("GET /api/challenges/:id — returns single challenge details with Zod validation", async () => {
    expect(challengeId).toBeDefined();
    const res = await fetch(`${CORE_URL}/challenges/${challengeId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    const challenge = ChallengeSchema.parse(data);
    expect(challenge.id).toBe(challengeId);
  });

  // 3. POST /api/challenges/:id/start
  it("POST /api/challenges/:id/start — provisions sandbox and returns valid session URLs", async () => {
    expect(challengeId).toBeDefined();
    const res = await fetch(`${CORE_URL}/challenges/${challengeId}/start`, {
      method: "POST",
      headers: { Authorization: `Bearer ${authToken}` },
    });

    expect([200, 201]).toContain(res.status);
    const data = await res.json();
    const session = StartSessionSchema.parse(data);
    expect(session.challengeId).toBe(challengeId);
    expect(session.terminalUrl).toContain(session.sessionId);
    expect(session.validateUrl).toContain(session.sessionId);
  });

  // 4. GET /api/content/quizzes
  it("GET /api/content/quizzes — returns raw array without wrapping and exposes slugs", async () => {
    const res = await fetch(`${CORE_URL}/content/quizzes`);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);

    const quizzes = QuizListSchema.parse(data);
    expect(quizzes.length).toBeGreaterThan(0);

    const quizWithSlug = quizzes.find((q) => q.metadata?.["slug"] || q.id);
    expect(quizWithSlug).toBeDefined();
    quizSlug = (quizWithSlug?.metadata?.["slug"] as string) || quizWithSlug!.id;
    expect(quizSlug).toBeTruthy();

    // Verify correctIndex is stripped (security property)
    quizzes.forEach((quiz) => {
      quiz.metadata.questions.forEach((q: any) => {
        expect(q.correctIndex).toBeUndefined();
      });
    });
  });

  // 5. POST /api/content/quizzes/:slug/submit
  it("POST /api/content/quizzes/:slug/submit — supports slug-based quiz submission", async () => {
    expect(quizSlug).toBeDefined();
    const res = await fetch(`${CORE_URL}/content/quizzes/${quizSlug}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: testUserId,
        answers: { "0": 0, "1": 1 },
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    const result = QuizSubmitResultSchema.parse(data);
    expect(typeof result.passed).toBe("boolean");
    expect(typeof result.score).toBe("number");
    expect(result.total).toBeGreaterThan(0);
  });

  // 6. GET /api/content/roadmaps and GET /api/me/roadmaps/:slug/progress
  it("GET /api/content/roadmaps & GET /api/me/roadmaps/:slug/progress — roadmap discovery & progress", async () => {
    const res = await fetch(`${CORE_URL}/content/roadmaps`);
    expect(res.status).toBe(200);

    const data = await res.json();
    const roadmaps = RoadmapListSchema.parse(data);
    expect(roadmaps.length).toBeGreaterThan(0);

    const firstRoadmap = roadmaps[0];
    expect(firstRoadmap).toBeDefined();
    const firstSlug = firstRoadmap!.slug;
    expect(firstSlug).toBeDefined();

    // Fetch user progress for this roadmap slug
    const progRes = await fetch(`${CORE_URL}/me/roadmaps/${firstSlug}/progress`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    expect(progRes.status).toBe(200);
    const progData = await progRes.json();
    const progress = RoadmapProgressSchema.parse(progData);
    expect(Array.isArray(progress.completedNodes)).toBe(true);
    expect(Array.isArray(progress.inProgressNodes)).toBe(true);
  });

  // 7. GET /api/me/dashboard
  it("GET /api/me/dashboard — returns authenticated user dashboard metrics", async () => {
    const res = await fetch(`${CORE_URL}/me/dashboard`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    const dashboard = DashboardSchema.parse(data);
    expect(dashboard.stats).toBeDefined();
    expect(dashboard.todayChallenge).toBeDefined();
    expect(dashboard.recommendedNext).toBeDefined();
  });

  // 8. GET /api/leaderboard
  it("GET /api/leaderboard — returns ranked platform leaderboard", async () => {
    const res = await fetch(`${CORE_URL}/leaderboard`);
    expect(res.status).toBe(200);

    const data = await res.json();
    const result = LeaderboardSchema.parse(data);
    expect(Array.isArray(result.leaderboard)).toBe(true);
  });

  // 9. GET /api/orgs/me (NO ORG)
  it("GET /api/orgs/me — returns 404 for a user not belonging to an org (fallbackData regression test)", async () => {
    const res = await fetch(`${CORE_URL}/orgs/me`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    expect(res.status).toBe(404);
    const data = (await res.json()) as { error: string };
    expect(data.error).toContain("Not a member of any organization");
  });

  // 10. Organization Lifecycle & Endpoints
  describe("Organization Lifecycle", () => {
    let orgId: string;
    const orgSlug = `test-org-${Date.now()}`;

    it("POST /api/orgs — creates an organization and sets creator as OWNER", async () => {
      const res = await fetch(`${CORE_URL}/orgs`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Acme Corp DevOps",
          slug: orgSlug,
          planTier: "TEAM",
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      const org = OrgSchema.parse(data);
      expect(org.slug).toBe(orgSlug);
      orgId = org.id;
    });

    it("GET /api/orgs/me — returns org info after creation", async () => {
      const res = await fetch(`${CORE_URL}/orgs/me`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as { id: string; myRole: string };
      expect(data.id).toBe(orgId);
      expect(data.myRole).toBe("OWNER");
    });

    it("GET /api/orgs/:orgId/members — returns member roster with score and status", async () => {
      expect(orgId).toBeDefined();
      const res = await fetch(`${CORE_URL}/orgs/${orgId}/members`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      const members = z.array(OrgMemberSchema).parse(data);
      expect(members.length).toBeGreaterThan(0);
      const firstMember = members[0];
      expect(firstMember).toBeDefined();
      expect(firstMember!.id).toBe(testUserId);
      expect(firstMember!.orgRole).toBe("OWNER");
    });

    it("GET /api/orgs/:orgId/analytics — returns organization aggregate analytics", async () => {
      expect(orgId).toBeDefined();
      const res = await fetch(`${CORE_URL}/orgs/${orgId}/analytics`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      const analytics = OrgAnalyticsSchema.parse(data);
      expect(analytics.totalEngineers).toBeGreaterThanOrEqual(1);
    });

    it("GET /api/orgs/:orgId/scenarios — returns organization custom scenario library", async () => {
      expect(orgId).toBeDefined();
      const res = await fetch(`${CORE_URL}/orgs/${orgId}/scenarios`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
    });
  });

  // 11. Negative Testing
  describe("Negative Testing", () => {
    it("GET /api/challenges/non-existent-id — returns 404", async () => {
      const res = await fetch(`${CORE_URL}/challenges/non-existent-id-999`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      expect(res.status).toBe(404);
    });

    it("POST /api/challenges/:id/start without auth — returns 401 Unauthorized", async () => {
      const res = await fetch(`${CORE_URL}/challenges/${challengeId}/start`, {
        method: "POST",
      });
      expect(res.status).toBe(401);
    });

    it("POST /api/content/quizzes/:slug/submit with garbage answers — returns graded response without crashing", async () => {
      expect(quizSlug).toBeDefined();
      const res = await fetch(`${CORE_URL}/content/quizzes/${quizSlug}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: testUserId,
          answers: { "garbage-question-key": 99999 },
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      const result = QuizSubmitResultSchema.parse(data);
      expect(result.passed).toBe(false);
      expect(result.score).toBe(0);
    });
  });

  // 12. Complex Real Use Cases & Multi-Tenant RBAC Enforcement
  describe("Complex Real Use Case: Multi-Tenant RBAC & Cross-Tenant Security", () => {
    let secondUserId: string;
    let secondAuthToken: string;
    let crossOrgId: string;

    beforeAll(async () => {
      // Register a second user (different tenant)
      const secondEmail = `tenant-b-${Date.now()}@example.com`;
      const regRes = await fetch(`${AUTH_URL}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: secondEmail,
          password: "Password123!",
          name: "Tenant B User",
        }),
      });
      const regData = (await regRes.json()) as { user?: { id: string }; token?: string; accessToken?: string };
      secondUserId = regData.user?.id || "";
      secondAuthToken = regData.token || regData.accessToken || "";

      // Tenant B creates their own org
      const orgRes = await fetch(`${CORE_URL}/orgs`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secondAuthToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Tenant B Org",
          slug: `tenant-b-org-${Date.now()}`,
          planTier: "TEAM",
        }),
      });
      const orgData = (await orgRes.json()) as { id: string };
      crossOrgId = orgData.id;
    });

    it("User A cannot access User B's org analytics (RBAC / Cross-Tenant 403)", async () => {
      const res = await fetch(`${CORE_URL}/orgs/${crossOrgId}/analytics`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      // Non-member access to other org's analytics must be rejected with 403 Forbidden
      expect(res.status).toBe(403);
    });

    it("User A cannot view User B's org members (RBAC / Cross-Tenant 403)", async () => {
      const res = await fetch(`${CORE_URL}/orgs/${crossOrgId}/members`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      expect(res.status).toBe(403);
    });

    it("User B can successfully access their own org analytics and members", async () => {
      const analyticsRes = await fetch(`${CORE_URL}/orgs/${crossOrgId}/analytics`, {
        headers: { Authorization: `Bearer ${secondAuthToken}` },
      });
      expect(analyticsRes.status).toBe(200);

      const membersRes = await fetch(`${CORE_URL}/orgs/${crossOrgId}/members`, {
        headers: { Authorization: `Bearer ${secondAuthToken}` },
      });
      expect(membersRes.status).toBe(200);
      const members = (await membersRes.json()) as any[];
      expect(members.some((m) => m.id === secondUserId)).toBe(true);
    });
  });

  // 13. Complex Real Use Case: Content Discovery & Flashcard Mastery
  describe("Complex Real Use Case: Flashcards & Content Study Decks", () => {
    it("GET /api/content/flashcards — returns structured study decks for Linux & K8s", async () => {
      const res = await fetch(`${CORE_URL}/content/flashcards`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as any[];
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThanOrEqual(2);

      const linuxDeck = data.find((d) => d.id === "deck-linux");
      expect(linuxDeck).toBeDefined();
      expect(linuxDeck.cards.length).toBeGreaterThanOrEqual(3);
      expect(linuxDeck.cards[0]).toHaveProperty("frontText");
      expect(linuxDeck.cards[0]).toHaveProperty("backText");
    });

    it("GET /api/content/roadmaps/linux-fundamentals — returns fully resolved graph nodes", async () => {
      const res = await fetch(`${CORE_URL}/content/roadmaps/linux-fundamentals`);
      expect(res.status).toBe(200);
      const roadmap = (await res.json()) as { slug: string; nodes: any[]; nodeCount: number };
      expect(roadmap.slug).toBe("linux-fundamentals");
      expect(Array.isArray(roadmap.nodes)).toBe(true);
      expect(roadmap.nodes.length).toBeGreaterThan(0);
      expect(roadmap.nodes[0]).toHaveProperty("chapterLabel");
      expect(roadmap.nodes[0]).toHaveProperty("timeEstimate");
    });
  });

  // 14. Complex Real Use Case: User Profile & Skill Progression Flow
  describe("Complex Real Use Case: User Profile & Activity Tracking", () => {
    it("GET /api/me/profile — returns complete user profile with achievements", async () => {
      const res = await fetch(`${CORE_URL}/me/profile`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      expect(res.status).toBe(200);
      const profile = (await res.json()) as { id: string; email: string; xp: number; badges: any[] };
      expect(profile.id).toBe(testUserId);
      expect(typeof profile.xp).toBe("number");
      expect(Array.isArray(profile.badges)).toBe(true);
    });

    it("PUT /api/me/profile — allows updating user job title and profile info", async () => {
      const res = await fetch(`${CORE_URL}/me/profile`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jobTitle: "Senior Infrastructure & Reliability Engineer",
        }),
      });

      expect(res.status).toBe(200);
      const updated = (await res.json()) as { jobTitle?: string };
      expect(updated.jobTitle).toBe("Senior Infrastructure & Reliability Engineer");
    });
  });
});
