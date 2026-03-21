export function getInviteFailureMessage(reason: string | undefined, fallback: string): string {
  if (reason === 'not_configured') return `${fallback} Email service is not configured.`;
  if (reason === 'provider_error') {
    return `${fallback} Email provider rejected the send. Check RESEND_API_KEY and EMAIL_FROM domain verification.`;
  }
  return `${fallback} Reason: ${reason || 'unknown'}.`;
}

