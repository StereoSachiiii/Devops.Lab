import { test as base, Page } from "@playwright/test";

const API_GATEWAY_URL = process.env["API_GATEWAY_URL"] || "http://127.0.0.1:8005";

export interface FreshUserData {
  id: string;
  email: string;
  name: string;
  token: string;
  password: string;
}

export const test = base.extend<{
  freshUser: FreshUserData;
  authenticatedPage: Page;
}>({
  // Fixture: creates a brand new unique user via Kong API gateway
  freshUser: async ({ request }, use) => {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000);
    const email = `e2e_${timestamp}_${random}@example.com`;
    const password = "Password123!Secure";
    const name = `E2E Tester ${random}`;

    // Register via Kong Gateway directly
    const res = await request.post(`${API_GATEWAY_URL}/api/auth/register`, {
      data: { email, password, name },
    });

    if (!res.ok()) {
      throw new Error(`Failed to create test user: ${res.status()} ${await res.text()}`);
    }

    const data = await res.json();
    const token = data.token;
    const userId = data.user?.id || data.token;

    // Complete onboarding so the interactive driver.js tour dialog doesn't block clicks
    await request.post(`${API_GATEWAY_URL}/api/challenges/onboarding-status/complete`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    await use({
      id: userId,
      email,
      name,
      token,
      password,
    });
  },

  // Fixture: authenticates the browser context with fresh session cookies & localStorage
  authenticatedPage: async ({ page, freshUser }, use) => {
    // Navigate to homepage first to set origin
    await page.goto("/login");

    // Fill form and login naturally so session cookies and AuthProvider SWR initialize cleanly
    await page.locator('input#email').fill(freshUser.email);
    await page.locator('input#password').fill(freshUser.password);
    await page.locator('button[type="submit"]').click();

    // Expect successful redirect to dashboard
    await page.waitForURL("**/dashboard", { timeout: 10000 });

    // Set tour completion flags in localStorage so onboarding popups do not intercept pointer clicks
    await page.evaluate(() => {
      localStorage.setItem("devopslab_has_seen_tour", "true");
      localStorage.setItem("hasSeenTour", "true");
      localStorage.setItem("hasSeenChallengeTour", "true");
      localStorage.setItem("has_seen_onboarding", "true");
    });

    await use(page);
  },
});

export { expect } from "@playwright/test";
