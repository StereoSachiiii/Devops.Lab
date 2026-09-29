import { test, expect } from "./fixtures";

test.describe("Dashboard & Streak Widget", () => {
  test.setTimeout(15000);

  test("dashboard renders streak widget and critical UI with clean console", async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    const consoleErrors: string[] = [];

    // Capture console errors
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const text = msg.text();
        // Exclude harmless 401s on /refresh or favicon
        if (!text.includes("401") && !text.includes("favicon") && !text.includes("failed to load resource")) {
          consoleErrors.push(text);
        }
      }
    });

    // authenticatedPage is already at /dashboard from the fixture
    await expect(page).toHaveURL(/\/dashboard/);

    // Check greeting header (wait for SWR data load)
    await expect(page.locator("h1")).toContainText(/Good (morning|afternoon|evening)/, { timeout: 10000 });

    // Check streak widget exists and has expected shape
    const streakWidget = page.locator("text=day streak");
    await expect(streakWidget).toBeVisible({ timeout: 6000 });

    // Verify streak count number is present
    const streakNumber = page.locator("span.font-space.font-bold.text-lg");
    await expect(streakNumber).toBeVisible();

    // Verify no unhandled exceptions in console
    expect(consoleErrors).toEqual([]);
  });
});
