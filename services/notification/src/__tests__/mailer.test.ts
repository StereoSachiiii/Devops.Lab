import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendWelcomeEmail, sendVerificationEmail } from "../mailer";

describe("Notification Mailer", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("sendWelcomeEmail executes without crashing in dev mode when RESEND_API_KEY is not set", async () => {
    delete process.env["RESEND_API_KEY"];
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(sendWelcomeEmail("test@example.com", "Test User")).resolves.not.toThrow();
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("[DEV] Would send Welcome Email"));
  });

  it("sendVerificationEmail generates link based on WEB_APP_URL", async () => {
    delete process.env["RESEND_API_KEY"];
    process.env["WEB_APP_URL"] = "https://app.devops.lab";
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await sendVerificationEmail("user@example.com", "secret-token-123");
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("https://app.devops.lab/verify?token=secret-token-123")
    );
  });
});
