import { test, expect } from "./fixtures";

test.describe("Community & Social Graph", () => {
  test.setTimeout(15000);

  test("loads community engineers, tests search filtering, and toggles follow state", async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    await page.goto("/community");

    // Header check
    await expect(page.locator("h1")).toHaveText("Discover Engineers", { timeout: 8000 });

    // Search bar check
    const searchInput = page.locator('input[placeholder*="Search by name"]');
    await expect(searchInput).toBeVisible();

    // Type query "Alex"
    await searchInput.fill("Alex");
    await page.waitForTimeout(500); // Debounce / network wait

    // Ensure Alex Rivera card is shown
    await expect(page.locator("text=Alex Rivera").first()).toBeVisible({ timeout: 6000 });

    // Test Follow button toggle on Alex Rivera's card
    const alexCard = page.locator('div:has-text("Alex Rivera")').filter({ hasText: "Follow" }).first();
    if (await alexCard.isVisible()) {
      const followButton = alexCard.locator('button:has-text("Follow")');
      await followButton.click();

      // Should transition to "Following"
      await expect(alexCard.locator('button:has-text("Following")')).toBeVisible({ timeout: 5000 });

      // Click again to unfollow
      await alexCard.locator('button:has-text("Following")').click();
      await expect(alexCard.locator('button:has-text("Follow")')).toBeVisible({ timeout: 5000 });
    }
  });
});
