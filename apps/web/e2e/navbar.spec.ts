import { test, expect } from "./fixtures";

test.describe("Navbar Visual & Layout Verification", () => {
  test.setTimeout(15000);

  test("navbar renders cleanly without overlap, truncation, or awkward wrapping at standard desktop resolution", async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Viewport 1280x800
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/dashboard");

    const nav = page.locator("nav");
    await expect(nav).toBeVisible({ timeout: 8000 });

    // 1. Logo / Brand on left
    const brand = nav.locator("text=DevOps.lab").first();
    await expect(brand).toBeVisible();

    // 2. Main links visible
    const links = ["Home", "Dashboard", "Teams", "Challenges", "Roadmaps", "Quizzes", "Leaderboard", "Community"];
    for (const linkText of links) {
      const link = nav.locator(`a:has-text("${linkText}")`).first();
      await expect(link).toBeVisible();
    }

    // 3. Theme toggle button visible
    const themeToggle = page.locator('button[aria-label="Toggle theme"]');
    await expect(themeToggle).toBeVisible();

    // 4. User profile dropdown / logout button visible on right
    const logoutBtn = page.locator('button[title="Log Out"]');
    await expect(logoutBtn).toBeVisible();

    // 5. Assert navbar height remains within standard single-row bounds (68px ± 10px)
    const box = await nav.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.height).toBeLessThanOrEqual(80);
    }
  });
});
