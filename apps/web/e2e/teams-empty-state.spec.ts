import { test, expect } from "./fixtures";

test.describe("Teams Regression: Non-Org Empty State", () => {
  test.setTimeout(15000);

  test("user with no organization sees strict empty state and NOT fake or mock org data", async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Navigate to /teams with our fresh user who belongs to NO organization
    await page.goto("/teams");

    // Strictly assert the "No Organization Found" empty state is displayed
    const emptyStateHeading = page.locator("h2");
    await expect(emptyStateHeading).toHaveText("No Organization Found", { timeout: 8000 });

    const emptyStateDescription = page.locator("text=You are not currently a member of any organization or enterprise team");
    await expect(emptyStateDescription).toBeVisible();

    const backButton = page.locator('a:has-text("Back to Dashboard")');
    await expect(backButton).toBeVisible();

    // STRICT REGRESSION CHECK: Ensure NO mock "Acme Corp" or fake team dashboard data is rendered
    await expect(page.locator("text=Acme Corp")).not.toBeVisible();
    await expect(page.locator("text=Team Analytics")).not.toBeVisible();
    await expect(page.locator("text=Team Assignment Matrix")).not.toBeVisible();
    await expect(page.locator("text=Custom Scenarios")).not.toBeVisible();
  });
});
