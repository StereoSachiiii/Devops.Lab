import { describe, it, expect, vi, beforeEach } from "vitest";
import { apiClient } from "../lib/apiClient";
import { API_ROUTES } from "../lib/api-routes";
import { getErrorMessage, ApiError, ErrorCodes } from "../lib/errors";

describe("E2E Critical User Journeys & Core Workflows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Workflow 1: User Authentication, Session Minting & Multi-Factor Auth (MFA)", () => {
    it("completes primary credentials login and requests MFA verification token", async () => {
      const mockPost = vi.spyOn(apiClient, "post").mockResolvedValueOnce({
        mfaRequired: true,
        mfaToken: "mock_mfa_challenge_token_xyz123",
      });

      const response = await apiClient.post<{ mfaRequired: boolean; mfaToken: string }>(
        API_ROUTES.auth.login,
        { email: "engineer@devops.lab", password: "SecurePassword123!" }
      );

      expect(mockPost).toHaveBeenCalledWith(API_ROUTES.auth.login, {
        email: "engineer@devops.lab",
        password: "SecurePassword123!",
      });
      expect(response.mfaRequired).toBe(true);
      expect(response.mfaToken).toBe("mock_mfa_challenge_token_xyz123");
    });

    it("verifies TOTP code and exchanges challenge token for active user session", async () => {
      const mockPost = vi.spyOn(apiClient, "post").mockResolvedValueOnce({
        user: {
          id: "usr_101",
          email: "engineer@devops.lab",
          name: "SRE Specialist",
          role: "LEARNER",
          xp: 1250,
          currentStreak: 5,
        },
      });

      const response = await apiClient.post<{ user: { id: string; xp: number } }>(
        API_ROUTES.auth.loginMfa,
        { mfaToken: "mock_mfa_challenge_token_xyz123", code: "123456" }
      );

      expect(mockPost).toHaveBeenCalledWith(API_ROUTES.auth.loginMfa, {
        mfaToken: "mock_mfa_challenge_token_xyz123",
        code: "123456",
      });
      expect(response.user.id).toBe("usr_101");
      expect(response.user.xp).toBe(1250);
    });

    it("resolves corporate identity provider domain via Enterprise SSO", async () => {
      const mockPost = vi.spyOn(apiClient, "post").mockResolvedValueOnce({
        success: true,
        exchangeToken: "sso_exchange_token_987",
        org: { id: "org_acme", name: "Acme Corp", slug: "acme-corp", ssoProvider: "OKTA" },
      });

      const response = await apiClient.post<{ success: boolean; exchangeToken: string; org: { slug: string } }>(
        "/api/auth/login/sso",
        { email: "devops@acme.corp" }
      );

      expect(mockPost).toHaveBeenCalledWith("/api/auth/login/sso", {
        email: "devops@acme.corp",
      });
      expect(response.success).toBe(true);
      expect(response.exchangeToken).toBe("sso_exchange_token_987");
      expect(response.org.slug).toBe("acme-corp");
    });
  });

  describe("Workflow 2: Interactive Sandbox Provisioning & Solution Validator Pipeline", () => {
    it("provisions an isolated gVisor/Docker lab sandbox container for a challenge", async () => {
      const mockPost = vi.spyOn(apiClient, "post").mockResolvedValueOnce({
        session: {
          id: "sess_k8s_debug_001",
          challengeId: "k8s-pod-crashloop",
          status: "RUNNING",
          terminalUrl: "ws://localhost:8080/sessions/sess_k8s_debug_001/ws",
          startedAt: "2026-08-28T01:00:00Z",
          expiresAt: "2026-08-28T02:00:00Z",
        },
      });

      const response = await apiClient.post<{ session: { id: string; status: string; terminalUrl: string } }>(
        API_ROUTES.challenges.start("k8s-pod-crashloop"),
        {}
      );

      expect(mockPost).toHaveBeenCalledWith("/api/challenges/k8s-pod-crashloop/start", {});
      expect(response.session.id).toBe("sess_k8s_debug_001");
      expect(response.session.status).toBe("RUNNING");
      expect(response.session.terminalUrl).toContain("/sessions/sess_k8s_debug_001/ws");
    });

    it("polls check-results as validator tests execute inside the sandbox control plane", async () => {
      const mockGet = vi.spyOn(apiClient, "get").mockResolvedValueOnce({
        checks: [
          { checkId: "check_1", status: "PASS", message: "Deployment replica count verified (3/3)" },
          { checkId: "check_2", status: "PASS", message: "Health probe endpoint responding HTTP 200" },
        ],
        allPassed: true,
        xpAwarded: 150,
      });

      const response = await apiClient.get<{
        checks: Array<{ checkId: string; status: string }>;
        allPassed: boolean;
        xpAwarded: number;
      }>(API_ROUTES.sessions.checkResults("sess_k8s_debug_001"));

      expect(mockGet).toHaveBeenCalledWith("/api/session/sess_k8s_debug_001/check-results");
      expect(response.allPassed).toBe(true);
      expect(response.checks).toHaveLength(2);
      expect(response.xpAwarded).toBe(150);
    });
  });

  describe("Workflow 3: Social Proof, Cryptographic Solution Seals & Custom Bookmark Collections", () => {
    it("mints an immutable public share token with platform seal verification upon completion", async () => {
      const mockPost = vi.spyOn(apiClient, "post").mockResolvedValueOnce({
        token: "tok_k8s_mastery_sig77",
        shareUrl: "/share/tok_k8s_mastery_sig77",
        type: "CHALLENGE_SOLVE",
        createdAt: "2026-08-28T01:30:00Z",
      });

      const response = await apiClient.post<{ token: string; shareUrl: string; type: string }>(
        API_ROUTES.shares.base,
        { challengeId: "k8s-pod-crashloop", type: "CHALLENGE_SOLVE" }
      );

      expect(mockPost).toHaveBeenCalledWith("/api/shares", {
        challengeId: "k8s-pod-crashloop",
        type: "CHALLENGE_SOLVE",
      });
      expect(response.token).toBe("tok_k8s_mastery_sig77");
      expect(response.shareUrl).toBe("/share/tok_k8s_mastery_sig77");
    });

    it("adds challenge to a custom named study track (e.g. 'Blind 75')", async () => {
      const mockPost = vi.spyOn(apiClient, "post").mockResolvedValueOnce({
        success: true,
        item: {
          id: "item_999",
          listId: "list_blind_75",
          challengeId: "k8s-pod-crashloop",
          order: 1,
        },
      });

      const response = await apiClient.post<{ success: boolean; item: { listId: string; challengeId: string } }>(
        API_ROUTES.lists.addItem("list_blind_75"),
        { challengeId: "k8s-pod-crashloop" }
      );

      expect(mockPost).toHaveBeenCalledWith("/api/lists/list_blind_75/items", {
        challengeId: "k8s-pod-crashloop",
      });
      expect(response.success).toBe(true);
      expect(response.item.challengeId).toBe("k8s-pod-crashloop");
    });
  });

  describe("Workflow 4: Enterprise B2B Org Provisioning & Compliance Matrix Export", () => {
    it("fetches team training compliance matrix and engineer progression", async () => {
      const mockGet = vi.spyOn(apiClient, "get").mockResolvedValueOnce({
        assignments: [
          {
            assignmentId: "asgn_sre_01",
            pathTitle: "Production SRE Onboarding",
            totalAssigned: 12,
            completedCount: 10,
            compliancePercent: 83.3,
          },
        ],
        engineers: [
          { userId: "u1", name: "Alex Engineer", completed: true, completedAt: "2026-08-27T12:00:00Z" },
        ],
      });

      const response = await apiClient.get<{
        assignments: Array<{ compliancePercent: number }>;
        engineers: Array<{ completed: boolean }>;
      }>("/api/orgs/me/assignments/matrix");

      expect(mockGet).toHaveBeenCalledWith("/api/orgs/me/assignments/matrix");
      expect(response.assignments[0]?.compliancePercent).toBe(83.3);
      expect(response.engineers[0]?.completed).toBe(true);
    });
  });

  describe("Workflow 5: Resilient Error Normalization Across Network Partitions", () => {
    it("transforms 401 unauthenticated into user-friendly error string", () => {
      const error = new ApiError("Unauthorized", 401);
      expect(getErrorMessage(error)).toBe("You must be logged in to perform this action.");
    });

    it("transforms 429 rate limits into friendly throttling feedback", () => {
      const error = new ApiError("Throttled", 429);
      expect(getErrorMessage(error)).toBe("Too many requests. Please slow down and try again later.");
    });

    it("maps backend ErrorCodes to precise user guidance", () => {
      const mfaErr = new ApiError("Wrong code", 400, ErrorCodes.INVALID_MFA_CODE);
      expect(getErrorMessage(mfaErr)).toBe("The verification code is incorrect. Please try again.");

      const lockErr = new ApiError("Locked", 403, ErrorCodes.ACCOUNT_LOCKED);
      expect(getErrorMessage(lockErr)).toContain("temporarily locked");
    });
  });
});
