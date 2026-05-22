import { NextRequest } from 'next/server';
import { createSuccessResponse, handleApiError } from '@/lib/error-handler';
import { getAuthUser } from '@/lib/auth-helpers';

export async function GET(_request: NextRequest) {
  try {
    const auth = await getAuthUser();
    const path = auth.role === 'dentist' || auth.role === 'asistent'
      ? '/calendar'
      : '/dashboard';

    return createSuccessResponse({ path });
  } catch (error) {
    return handleApiError(error, 'Failed to resolve landing page');
  }
}
