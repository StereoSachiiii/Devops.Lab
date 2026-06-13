import { Resend } from 'resend';

// Use Resend for production emails
const resend = new Resend(process.env.RESEND_API_KEY || 're_123456789');

export async function sendWelcomeEmail(to: string) {
  if (!process.env.RESEND_API_KEY) {
    console.warn(`[DEV] Would send Welcome Email to ${to}`);
    return;
  }

  return resend.emails.send({
    from: 'DevOps Platform <noreply@devops.local>',
    to,
    subject: 'Welcome to the DevOps Platform!',
    text: 'We are excited to have you on board. Start your first challenge today!',
    html: '<b>We are excited to have you on board.</b> <p>Start your first challenge today!</p>',
  });
}

export async function sendVerificationEmail(to: string, token: string) {
  const verificationLink = `http://localhost:3000/verify?token=${token}`;
  
  if (!process.env.RESEND_API_KEY) {
    console.warn(`[DEV] Would send Verification Email to ${to} with link: ${verificationLink}`);
    return;
  }

  return resend.emails.send({
    from: 'DevOps Platform <noreply@devops.local>',
    to,
    subject: 'Verify your Email',
    text: `Please verify your email using this link: ${verificationLink}`,
    html: `<p>Please verify your email using this link: <a href="${verificationLink}">${verificationLink}</a></p>`,
  });
}
