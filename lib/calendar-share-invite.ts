import crypto from 'crypto';
import { sendEmail, type EmailSendResult } from '@/lib/email';

function getBaseUrl() {
  const vercel = process.env.VERCEL_URL;
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL;
  if (vercel) return vercel.startsWith('http') ? vercel : `https://${vercel}`;
  return 'http://localhost:3000';
}

export function hashCalendarShareToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function createCalendarShareInviteToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(32).toString('hex');
  return {
    token,
    tokenHash: hashCalendarShareToken(token),
  };
}

export async function sendCalendarShareInviteEmail(params: {
  to: string;
  inviterName: string;
  calendarName: string;
  token: string;
}): Promise<EmailSendResult> {
  const inviteUrl = `${getBaseUrl()}/calendar-invite/${params.token}`;

  return sendEmail({
    to: params.to,
    subject: `${params.inviterName} ti-a partajat calendarul ${params.calendarName}`,
    html: `
      <h2>Invitatie calendar</h2>
      <p>${params.inviterName} ti-a partajat calendarul <strong>${params.calendarName}</strong>.</p>
      <p>Apasa pe butonul de mai jos pentru a accepta invitatia:</p>
      <p>
        <a href="${inviteUrl}" style="background:#2563eb;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">
          Accepta invitatia
        </a>
      </p>
      <p>Link-ul expira in 7 zile.</p>
      <p style="color:#666;font-size:13px;">Daca nu te asteptai la aceasta invitatie, poti ignora acest email.</p>
    `,
  });
}
