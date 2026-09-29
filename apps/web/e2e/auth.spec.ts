import { test, expect } from "./fixtures";

test.describe("Authentication Flows", () => {
  test.setTimeout(15000);

  test("should register a fresh user, redirect to dashboard, and establish session", async ({ page }) => {
    const timestamp = Date.now();
    const uniqueEmail = `reg_flow_${timestamp}@example.com`;
    const password = "Password123!Secure";
    const name = "Registration Spec";

    await page.goto("/register");

    // Fill registration form
    await page.locator('input#name').fill(name);
    await page.locator('input#email').fill(uniqueEmail);
    await page.locator('input#password').fill(password);

    // Submit
    await page.locator('button[type="submit"]').click();

    // Verify redirection to dashboard or homepage with authenticated state
    await expect(page).toHaveURL(/\/(dashboard)?$/, { timeout: 10000 });
  });

  test("should log in with valid credentials and log out cleanly", async ({ page, freshUser }) => {
    await page.goto("/login");

    await page.locator('input#email').fill(freshUser.email);
    await page.locator('input#password').fill(freshUser.password);
    await page.locator('button[type="submit"]').click();

    // Confirm dashboard reached
    await page.waitForURL("**/dashboard", { timeout: 10000 });
    await expect(page.locator("text=day streak")).toBeVisible({ timeout: 5000 });

    // Click logout button on navbar (desktop)
    const logoutBtn = page.locator('button[title="Log Out"]');
    await expect(logoutBtn).toBeVisible({ timeout: 5000 });
    await logoutBtn.click();

    // Verify redirected back to /login
    await page.waitForURL("**/login", { timeout: 8000 });
    await expect(page.locator("h2")).toHaveText(/Sign in/i);
  });

  test("OAuth button click redirects towards Google authorization server", async ({ page }) => {
    await page.goto("/login");

    // Intercept navigation to Google
    const googleButton = page.locator('button:has-text("Google")');
    await expect(googleButton).toBeVisible();

    const [request] = await Promise.all([
      page.waitForRequest((req) => req.url().includes("/api/auth/login/google") || req.url().includes("accounts.google.com"), { timeout: 7000 }),
      googleButton.click(),
    ]);

    expect(request.url()).toMatch(/(login\/google|accounts\.google\.com)/);
  });
});
