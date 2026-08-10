import { describe, it, expect } from "vitest";
import { z } from "zod";

// We'll use native fetch for HTTP calls to the gateway
const API_URL = process.env["API_GATEWAY_URL"] || "http://localhost:8005";
const AUTH_URL = `${API_URL}/api/auth`;

// --- STRICT ZOD SCHEMAS ---
const AppErrorSchema = z.object({
  error: z.string(),
  code: z.string(),
});

const ValidationErrorSchema = z.object({
  statusCode: z.number(),
  error: z.string(),
  message: z.string(),
});

const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  role: z.enum(["LEARNER", "ADMIN"]),
  orgId: z.string().optional().nullable(),
});

const AuthSuccessSchema = z.object({
  token: z.string(),
  user: UserSchema,
});

const MeSuccessSchema = z.object({
  user: UserSchema,
}).or(UserSchema);

const LogoutSuccessSchema = z.object({
  success: z.boolean(),
});

describe("Auth Integration Tests (via API Gateway)", () => {
  const userEmail = `test-${Date.now()}@example.com`;
  const userPassword = "Password123!";
  
  // These will hold cookies across requests
  let authCookies: string[] = [];
  
  const extractCookies = (res: Response) => {
    return res.headers.getSetCookie();
  };

  const getCookieHeader = () => authCookies.join("; ");

  it("should register a new user successfully", async () => {
    const res = await fetch(`${AUTH_URL}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: userEmail, password: userPassword })
    });
    
    expect([200, 201]).toContain(res.status);
    const data = await res.json();
    
    // STRICT SCHEMA VALIDATION
    AuthSuccessSchema.parse(data);
  });

  it("should login and set correct cookie attributes", async () => {
    const res = await fetch(`${AUTH_URL}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: userEmail, password: userPassword })
    });
    
    expect(res.status).toBe(200);
    const data = await res.json();
    
    // STRICT SCHEMA VALIDATION
    AuthSuccessSchema.parse(data);

    // Verify Set-Cookie headers
    authCookies = extractCookies(res);
    expect(authCookies.length).toBeGreaterThan(0);
    
    const refreshTokenCookie = authCookies.find(c => c.startsWith("refreshToken="));
    expect(refreshTokenCookie).toBeDefined();
    expect(refreshTokenCookie).toContain("HttpOnly");
    expect(refreshTokenCookie).toContain("SameSite=Lax");
    expect(refreshTokenCookie).not.toContain("Domain=");
  });

  it("should fetch /me using the valid cookies", async () => {
    const res = await fetch(`${AUTH_URL}/me`, {
      headers: {
        "Cookie": getCookieHeader()
      }
    });
    
    expect(res.status).toBe(200);
    const data = await res.json();
    
    // STRICT SCHEMA VALIDATION
    const parsed = MeSuccessSchema.parse(data);
    const user = 'user' in parsed ? parsed.user : parsed;
    expect(user.email).toBe(userEmail);
  });

  it("should handle missing cookies gracefully with 401 REFRESH_TOKEN_MISSING", async () => {
    const res = await fetch(`${AUTH_URL}/refresh`, {
      method: "POST"
    });
    
    expect(res.status).toBe(401);
    const data = await res.json();
    
    // STRICT SCHEMA VALIDATION
    const parsed = AppErrorSchema.parse(data);
    expect(parsed.code).toBe("REFRESH_TOKEN_MISSING");
  });

  it("should handle malformed/stale cookies gracefully with 401 SESSION_EXPIRED", async () => {
    const res = await fetch(`${AUTH_URL}/refresh`, {
      method: "POST",
      headers: {
        "Cookie": "refreshToken=invalid-stale.cookie"
      }
    });
    
    expect(res.status).toBe(401);
    const data = await res.json();
    
    // STRICT SCHEMA VALIDATION
    const parsed = AppErrorSchema.parse(data);
    expect(parsed.code).toBe("SESSION_EXPIRED");
  });

  it("should NOT wipe active sessions when a forged/garbage cookie is sent for a valid user", async () => {
    const forgedCookie = `refreshToken=fakeUserIdWithoutDots.garbagehash`;
    const res = await fetch(`${AUTH_URL}/refresh`, {
      method: "POST",
      headers: { "Cookie": forgedCookie }
    });
    
    expect(res.status).toBe(401);
    const data = await res.json();
    
    // STRICT SCHEMA VALIDATION
    const parsed = AppErrorSchema.parse(data);
    expect(parsed.code).toBe("SESSION_EXPIRED");

    // Prove the user's REAL active session is still valid!
    const res2 = await fetch(`${AUTH_URL}/me`, {
      headers: { "Cookie": getCookieHeader() }
    });
    expect(res2.status).toBe(200);
    const meData = await res2.json();
    
    // STRICT SCHEMA VALIDATION
    MeSuccessSchema.parse(meData);
  });

  it("should detect a genuine replay attack and wipe sessions", async () => {
    const currentCookie = getCookieHeader();
    
    const refreshRes = await fetch(`${AUTH_URL}/refresh`, {
      method: "POST",
      headers: { "Cookie": currentCookie }
    });
    expect(refreshRes.status).toBe(200);
    
    // STRICT SCHEMA VALIDATION
    AuthSuccessSchema.parse(await refreshRes.json());
    
    const newCookies = extractCookies(refreshRes);
    const newCookieHeader = newCookies.join("; ");
    
    // Wait out grace period
    await new Promise(r => setTimeout(r, 11000));
    
    const replayRes = await fetch(`${AUTH_URL}/refresh`, {
      method: "POST",
      headers: { "Cookie": currentCookie }
    });
    expect(replayRes.status).toBe(401);
    const replayData = await replayRes.json();
    
    // STRICT SCHEMA VALIDATION
    const parsed = AppErrorSchema.parse(replayData);
    expect(parsed.code).toBe("SESSION_COMPROMISED");
    
    const refreshNewRes = await fetch(`${AUTH_URL}/refresh`, {
      method: "POST",
      headers: { "Cookie": newCookieHeader }
    });
    expect(refreshNewRes.status).toBe(401); 
    const refreshNewData = await refreshNewRes.json();
    
    // STRICT SCHEMA VALIDATION
    AppErrorSchema.parse(refreshNewData);
  }, 15000);

  it("should handle concurrent refreshes cleanly (Grace Period)", async () => {
    const loginRes = await fetch(`${AUTH_URL}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: userEmail, password: userPassword })
    });
    const freshCookies = extractCookies(loginRes).join("; ");
    
    const p1 = fetch(`${AUTH_URL}/refresh`, {
      method: "POST",
      headers: { "Cookie": freshCookies }
    });
    const p2 = fetch(`${AUTH_URL}/refresh`, {
      method: "POST",
      headers: { "Cookie": freshCookies }
    });

    const [res1, res2] = await Promise.all([p1, p2]);
    
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);

    // STRICT SCHEMA VALIDATION
    AuthSuccessSchema.parse(await res1.json());
    AuthSuccessSchema.parse(await res2.json());

    authCookies = extractCookies(res2);
  });

  it("should return 401 for a genuinely expired JWT", async () => {
    const res = await fetch(`${AUTH_URL}/me`, {
      headers: {
        "Authorization": "Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMyIsImV4cCI6MTIzNDU2Nzg5MH0.invalid_signature"
      }
    });
    
    expect(res.status).toBe(401);
    
    // STRICT SCHEMA VALIDATION
    AppErrorSchema.parse(await res.json());
  });

  it("should logout successfully and clear cookies", async () => {
    const res = await fetch(`${AUTH_URL}/logout`, {
      method: "POST",
      headers: { "Cookie": getCookieHeader() }
    });
    
    expect(res.status).toBe(200);
    const data = await res.json();
    
    // STRICT SCHEMA VALIDATION
    LogoutSuccessSchema.parse(data);
    
    const setCookies = extractCookies(res);
    expect(setCookies.length).toBeGreaterThan(0);
    
    const refreshTokenCookie = setCookies.find(c => c.startsWith("refreshToken="));
    expect(refreshTokenCookie).toMatch(/Max-Age=0|Expires=/i);
  });
  describe("Negative Testing", () => {
    it("should return 400 for invalid email format", async () => {
      const res = await fetch(`${AUTH_URL}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "not-an-email", password: "Password123!" })
      });
      expect(res.status).toBe(400);
      ValidationErrorSchema.parse(await res.json());
    });

    it("should return 400 for missing password", async () => {
      const res = await fetch(`${AUTH_URL}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: `test-${Date.now()}@example.com` })
      });
      expect(res.status).toBe(400);
      ValidationErrorSchema.parse(await res.json());
    });

    it("should return 4xx for duplicate registration", async () => {
      const dupEmail = `dup-${Date.now()}@example.com`;
      await fetch(`${AUTH_URL}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: dupEmail, password: "Password123!" })
      });

      const res = await fetch(`${AUTH_URL}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: dupEmail, password: "Password123!" })
      });
      
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
      AppErrorSchema.parse(await res.json());
    });

    it("should return 400 or 415 for wrong content-type", async () => {
      const res = await fetch(`${AUTH_URL}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `email=test@example.com&password=Password123!`
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
      ValidationErrorSchema.parse(await res.json());
    });

    it("should return 413 for oversized payload", async () => {
      const hugeString = "a".repeat(2 * 1024 * 1024);
      const res = await fetch(`${AUTH_URL}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: `test@example.com`, password: "Password123!", hugeField: hugeString })
      });
      expect(res.status).toBe(413);
    });
  });

  describe("Rate Limiting & Account Lockout", () => {
    it("should lock account after 5 failed attempts", async () => {
      const targetEmail = `lockout-${Date.now()}@example.com`;
      await fetch(`${AUTH_URL}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: targetEmail, password: "Password123!" })
      });

      for (let i = 0; i < 5; i++) {
        const failRes = await fetch(`${AUTH_URL}/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: targetEmail, password: "WrongPassword!" })
        });
        expect(failRes.status).toBe(401);
      }

      const lockedRes = await fetch(`${AUTH_URL}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: targetEmail, password: "Password123!" })
      });
      
      expect(lockedRes.status).toBe(429);
      const data = (await lockedRes.json()) as { code: string };
      expect(data.code).toBe("ACCOUNT_LOCKED");
    });

    it("should trigger 429 Too Many Requests when hitting Kong limits", async () => {
      const requests = [];
      for (let i = 0; i < 150; i++) {
        requests.push(
          fetch(`${AUTH_URL}/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: "fake@example.com", password: "fake" })
          })
        );
      }
      
      const responses = await Promise.all(requests);
      const statusCodes = responses.map(r => r.status);
      expect(statusCodes).toContain(429);
    });
  });
});
