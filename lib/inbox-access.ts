import { AuthError, type AuthContext } from '@/lib/auth-helpers';

export function requireInboxAccess(auth: AuthContext): void {
  if (auth.role === 'asistent') {
    throw new AuthError('Inbox is not available for asistents', 403);
  }
}
