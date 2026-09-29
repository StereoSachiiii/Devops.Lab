import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  /* Maximum time one test can run for. Explicitly set to 20 seconds so it fails fast. */
  timeout: 20000,
  expect: {
    /* Maximum time expect() should wait for the condition to be met */
    timeout: 5000,
  },
  /* Run tests sequentially to avoid DB connection pool exhaustion in Docker microservices */
  fullyParallel: false,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env["CI"],
  /* Retry on CI only */
  retries: 0,
  /* Sequential execution for deterministic DB interaction */
  workers: 1,
  /* Reporter to use. */
  reporter: [["list"]],
  /* Shared settings for all the projects below. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: process.env["PLAYWRIGHT_BASE_URL"] || "http://localhost:3000",

    /* Collect trace when retrying the failed test. */
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "off",
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
});
