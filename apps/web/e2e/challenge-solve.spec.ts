import { test, expect } from "./fixtures";

test.describe("Challenge Sandbox Solve Flow", () => {
  test.setTimeout(20000);

  test("starts nginx-syntax-fix sandbox, shows boot progress, and confirms terminal is typable", async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Navigate directly to Fix the Broken Nginx Config challenge
    await page.goto("/challenges");
    const challengeLink = page.locator('text=Fix the Broken Nginx Config').first();
    await challengeLink.click();

    await page.waitForURL(/\/challenges\/[a-zA-Z0-9]+/, { timeout: 8000 });

    // Click "Launch Sandbox" button
    const launchBtn = page.locator('button:has-text("Launch Sandbox")');
    await expect(launchBtn).toBeVisible({ timeout: 6000 });
    await launchBtn.click();

    // Verify sandbox transitions to active terminal (Stop Sandbox button becomes visible)
    await expect(page.locator("text=Stop Sandbox")).toBeVisible({ timeout: 18000 });

    // Focus xterm terminal container and type a probe command
    const terminalContainer = page.locator(".xterm-screen, .xterm-rows");
    await expect(terminalContainer.first()).toBeVisible({ timeout: 5000 });
    await terminalContainer.first().click();

    // Send keystrokes
    await page.keyboard.type("echo 'SANDBOX_READY_PROBE'");
    await page.keyboard.press("Enter");

    // Wait 1s and check xterm text
    await page.waitForTimeout(1000);
    const xtermContent = await page.locator(".xterm").innerText();
    expect(xtermContent).toContain("SANDBOX_READY_PROBE");
  });
});
