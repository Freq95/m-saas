import { NextRequest } from 'next/server';
import { getAuthUser } from '@/lib/auth-helpers';
import { createSuccessResponse, handleApiError } from '@/lib/error-handler';
import { getPendingSharesForUser } from '@/lib/server/calendars-list';

// GET /api/calendar-shares/pending - List pending shares for current user
export async function GET(_request: NextRequest) {
  try {
    const auth = await getAuthUser();
    const payload = await getPendingSharesForUser(auth);
    return createSuccessResponse(payload);
  } catch (error) {
    return handleApiError(error, 'Failed to fetch pending calendar shares');
  }
}
