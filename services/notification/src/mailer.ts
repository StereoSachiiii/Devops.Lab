import { Resend } from "resend";

let resendInstance: Resend | null = null;
function getResend() {
  if (!resendInstance) {
    const apiKey = process.env["RESEND_API_KEY"];
    if (!apiKey) {
      return null;
    }
    resendInstance = new Resend(apiKey);
  }
  return resendInstance;
}

export async function sendWelcomeEmail(to: string, name: string): Promise<void> {
  const resend = getResend();
  if (!resend) {
    console.warn(`[DEV] Would send Welcome Email to ${to} for user: ${name}`);
    return;
  }

  await resend.emails.send({
    from: "DevOps Platform <noreply@devops.local>",
    to,
    subject: "Welcome to the DevOps Platform!",
    text: `Hello ${name}, we are excited to have you on board. Start your first challenge today!`,
    html: `<p>Hello ${name},</p><b>We are excited to have you on board.</b> <p>Start your first challenge today!</p>`,
  });
}

export async function sendVerificationEmail(to: string, token: string) {
  const baseUrl = process.env["WEB_APP_URL"] || process.env["APP_URL"] || "http://localhost:3000";
  const verificationLink = `${baseUrl.replace(/\/$/, "")}/verify?token=${token}`;

  const resend = getResend();
  if (!resend) {
    console.warn(`[DEV] Would send Verification Email to ${to} with link: ${verificationLink}`);
    return;
  }

  return resend.emails.send({
    from: "DevOps Platform <noreply@devops.local>",
    to,
    subject: "Verify your Email",
    text: `Please verify your email using this link: ${verificationLink}`,
    html: `<p>Please verify your email using this link: <a href="${verificationLink}">${verificationLink}</a></p>`,
  });
}
