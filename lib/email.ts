import { Resend } from 'resend';

export async function sendEmail(options: { to: string; subject: string; html: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[EMAIL] RESEND_API_KEY not set. Would have sent:', options.to, options.subject);
    return null;
  }

  const resend = new Resend(apiKey);
  return resend.emails.send({
    from: process.env.EMAIL_FROM || 'noreply@yourdomain.com',
    ...options,
  });
}
