import { test, expect } from "./fixtures";

test.describe("Challenge Solution Validation Flow", () => {
  test.setTimeout(25000);

  test("validates untouched broken nginx configuration with expected failure, applies fix, and validates success", async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    await page.goto("/challenges");
    const challengeLink = page.locator('text=Fix the Broken Nginx Config').first();
    await challengeLink.click();

    await page.waitForURL(/\/challenges\/[a-zA-Z0-9]+/, { timeout: 8000 });

    // Launch the sandbox
    const launchBtn = page.locator('button:has-text("Launch Sandbox")');
    await expect(launchBtn).toBeVisible({ timeout: 6000 });
    await launchBtn.click();

    // Wait until connected
    await expect(page.locator("text=Stop Sandbox")).toBeVisible({ timeout: 15000 });

    // 1. First Validation: Untouched broken state -> Expect failure
    const validateBtn = page.locator('button:has-text("Validate Solution")');
    await expect(validateBtn).toBeEnabled({ timeout: 5000 });
    await validateBtn.click();

    // Expect failed check indication (e.g. 0/3 or less than total checks passed)
    await expect(page.locator('text=Nginx configuration syntax check failed, text=Nginx is not serving on port 80, text=failed').first()).toBeVisible({ timeout: 10000 });

    // 2. Apply fix via terminal keystrokes:
    // Semicolon on worker_processes 1; change port to 80; service nginx start
    const terminalContainer = page.locator(".xterm-screen, .xterm-rows");
    await terminalContainer.first().click();

    // One-liner fix command
    const fixCmd = "sed -i 's/worker_processes 1/worker_processes 1;/' /etc/nginx/nginx.conf && sed -i 's/listen 8080;/listen 80;/' /etc/nginx/nginx.conf && service nginx start\n";
    await page.keyboard.type(fixCmd, { delay: 5 });
    await page.keyboard.press("Enter");

    // Wait 2s for nginx daemon to initialize
    await page.waitForTimeout(2000);

    // 3. Second Validation: Fixed state -> Expect success and celebratory banner
    await validateBtn.click();

    // Check for success feedback and celebratory banner
    await expect(page.locator('text=Challenge Solved!, text=3 / 3 checks passed, text=+100 XP').first()).toBeVisible({ timeout: 10000 });
  });
});
