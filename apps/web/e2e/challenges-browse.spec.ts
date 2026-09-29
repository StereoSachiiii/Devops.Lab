import { test, expect } from "./fixtures";

test.describe("Challenges Catalog & Detail Browsing", () => {
  test.setTimeout(15000);

  test("challenges list loads with multiple items including the 4 new challenges", async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    await page.goto("/challenges");

    // Ensure catalog content renders
    await expect(page.locator("text=Why hands-on beats reading")).toBeVisible({ timeout: 8000 });

    // Verify presence of the 4 newly added challenges
    const newChallenges = [
      "Fix the Broken Nginx Config",
      "Find and Kill the Runaway Process",
      "Fix File Permissions",
      "Environment Variable Debugging",
    ];

    for (const title of newChallenges) {
      const challengeElement = page.locator(`text=${title}`);
      await expect(challengeElement).toBeVisible({ timeout: 5000 });
    }
  });

  test("clicking a challenge navigates to its detail workspace with correct metadata", async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    await page.goto("/challenges");

    // Click "Fix the Broken Nginx Config" card
    const targetCard = page.locator('text=Fix the Broken Nginx Config').first();
    await expect(targetCard).toBeVisible({ timeout: 8000 });
    await targetCard.click();

    // Verify workspace layout loads
    await expect(page).toHaveURL(/\/challenges\/[a-zA-Z0-9]+/, { timeout: 8000 });
    await expect(page.locator("h1")).toContainText("Fix the Broken Nginx Config", { timeout: 6000 });
    await expect(page.locator("text=JUNIOR").first()).toBeVisible();
    await expect(page.locator("text=100 XP").first()).toBeVisible();
  });
});
