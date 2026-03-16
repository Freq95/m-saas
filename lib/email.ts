import { Resend } from 'resend';

export type EmailSendResult =
  | { ok: true; provider: 'resend'; id?: string }
  | { ok: false; reason: 'not_configured' | 'provider_error' };

export async function sendEmail(options: { to: string; subject: string; html: string }): Promise<EmailSendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[EMAIL] RESEND_API_KEY not set. Would have sent:', options.to, options.subject);
    return { ok: false, reason: 'not_configured' };
  }

  try {
    const resend = new Resend(apiKey);
    const result = await resend.emails.send({
      from: process.env.EMAIL_FROM || 'noreply@yourdomain.com',
      ...options,
    });

    if (result?.error) {
      console.error('[EMAIL] Resend error:', {
        name: result.error.name,
        message: result.error.message,
        to: options.to,
        subject: options.subject,
      });
      return { ok: false, reason: 'provider_error' };
    }

    return { ok: true, provider: 'resend', id: typeof result?.data?.id === 'string' ? result.data.id : undefined };
  } catch (error) {
    console.error('[EMAIL] Unexpected email send exception:', error);
    return { ok: false, reason: 'provider_error' };
  }
}
