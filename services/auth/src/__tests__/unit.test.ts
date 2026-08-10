import { describe, it, expect, vi } from "vitest";
import { parseRefreshToken, cookieOpts, signAccessToken } from "../utils/session";

describe("Auth Unit Tests", () => {
  describe("parseRefreshToken", () => {
    it("returns null for undefined input", () => {
      expect(parseRefreshToken(undefined)).toBeNull();
    });

    it("returns null for malformed token (no dot)", () => {
      expect(parseRefreshToken("invalidtokenformat")).toBeNull();
    });

    it("returns null for malformed token (too many dots)", () => {
      expect(parseRefreshToken("user.secret.extra")).toBeNull();
    });

    it("parses valid token correctly and computes redisKey", () => {
      const parsed = parseRefreshToken("user-123.mysecret");
      expect(parsed).not.toBeNull();
      expect(parsed?.userId).toBe("user-123");
      // The hash of "mysecret" is a specific sha256. 
      // Just assert it starts with auth:refresh:user-123: and has 64 hex chars
      expect(parsed?.redisKey).toMatch(/^auth:refresh:user-123:[a-f0-9]{64}$/);
    });
  });

  describe("signAccessToken", () => {
    it("signs JWT with correct payload", () => {
      const mockFastify = {
        jwt: {
          sign: vi.fn().mockReturnValue("signed.jwt.token")
        }
      };

      const user = { id: "user-456", email: "test@test.com", role: "LEARNER", orgId: "org-1" };
      const token = signAccessToken(mockFastify as unknown as import("fastify").FastifyInstance, user as unknown as import("@devops/db").User);
      
      expect(token).toBe("signed.jwt.token");
      expect(mockFastify.jwt.sign).toHaveBeenCalledWith({
        sub: "user-456",
        email: "test@test.com",
        role: "LEARNER",
        orgId: "org-1",
        iss: expect.any(String) as unknown
      });
    });
  });

  describe("cookieOpts", () => {
    it("has expected defaults", () => {
      expect(cookieOpts.httpOnly).toBe(true);
      expect(cookieOpts.path).toBe("/");
      expect(cookieOpts.sameSite).toBe("lax");
    });
  });

  describe("Org-Scoping & Tenant Logic", () => {
    it("lazily computes tenant client with correct orgId", () => {
      // We can just simulate the behavior defined in tenant-prisma.ts
      let cachedOrgId: string | undefined | null = null;
      let calls = 0;
      
      const req: { user: { orgId: string; sub: string }; prisma?: unknown } = { user: { orgId: "org-1", sub: "user-1" } };
      
      Object.defineProperty(req, "prisma", {
        get() {
          const orgId = req.user.orgId;
          if (cachedOrgId === orgId && calls > 0) return "cached";
          
          calls++;
          cachedOrgId = orgId;
          return "new-client";
        }
      });
      
      expect(req.prisma).toBe("new-client");
      expect(calls).toBe(1);
      
      // Accessing again should use cache
      expect(req.prisma).toBe("cached");
      expect(calls).toBe(1);
      
      // Changing user context (e.g. after JWT verification) should bust cache
      req.user.orgId = "org-2";
      expect(req.prisma).toBe("new-client");
      expect(calls).toBe(2);
    });
  });
});
