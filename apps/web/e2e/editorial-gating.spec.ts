import { test, expect } from "./fixtures";

test.describe("Editorial Gating & Access Control", () => {
  test.setTimeout(15000);

  test("unsolved learner sees locked editorial state with instructions", async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    await page.goto("/challenges");
    const challengeLink = page.locator('text=Fix the Broken Nginx Config').first();
    await challengeLink.click();

    await page.waitForURL(/\/challenges\/[a-zA-Z0-9]+/, { timeout: 8000 });

    // Dismiss onboarding tutorial tour if present
    await page.evaluate(() => {
      localStorage.setItem("devopslab_has_seen_tour", "true");
      localStorage.setItem("hasSeenTour", "true");
      const tourCloseBtn = document.querySelector(".driver-popover-close-btn") as HTMLElement;
      if (tourCloseBtn) tourCloseBtn.click();
      const overlay = document.querySelector(".driver-overlay") as HTMLElement;
      if (overlay) overlay.remove();
    });

    // Switch to editorial tab
    const editorialTab = page.locator('button:has-text("editorial")');
    await expect(editorialTab).toBeVisible({ timeout: 5000 });
    await editorialTab.click({ force: true });

    // Confirm locked state UI
    await expect(page.locator("text=Editorial Solution Locked")).toBeVisible({ timeout: 6000 });
    await expect(page.locator("text=Solve and validate this challenge in the active terminal sandbox")).toBeVisible();
    await expect(page.locator("text=Pass all verification checks to unlock")).toBeVisible();
  });

  test("privileged admin user can access editorial solution directly", async ({ page, request }) => {
    // Register fresh user and grant ADMIN role directly via backend API if available,
    // or log in as the pre-seeded admin user jane@example.com (or check admin access)
    // To ensure fresh data per rule 2, register a new user and login
    const timestamp = Date.now();
    const adminEmail = `admin_tester_${timestamp}@example.com`;
    const password = "Password123!Secure";

    const regRes = await request.post("http://127.0.0.1:8005/api/auth/register", {
      data: { email: adminEmail, password, name: "Admin Tester" },
    });
    expect(regRes.ok()).toBe(true);

    // Update user role to ADMIN in Postgres directly via psql
    const { execSync } = await import("child_process");
    execSync(`docker exec -i postgres psql -U postgres -d appdb`, {
      input: `UPDATE "User" SET role = 'ADMIN' WHERE email = '${adminEmail}';\n`,
    });

    await page.goto("/login");
    await page.locator('input#email').fill(adminEmail);
    await page.locator('input#password').fill(password);
    await page.locator('button[type="submit"]').click();

    await page.waitForURL("**/dashboard", { timeout: 10000 });

    await page.goto("/challenges");
    await page.locator('text=Fix the Broken Nginx Config').first().click();

    // Click editorial tab
    await page.locator('button:has-text("editorial")').click();

    // Confirm unlocked official solution guide is visible
    await expect(page.locator("text=Official Solution Guide & Postmortem")).toBeVisible({ timeout: 6000 });
    await expect(page.locator("text=Root Cause Analysis")).toBeVisible();
  });
});
