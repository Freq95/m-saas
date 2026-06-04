import { NextRequest, NextResponse } from 'next/server';
import { handleApiError, createSuccessResponse } from '@/lib/error-handler';
import { getUserEmailIntegrations } from '@/lib/email-integrations';
import { getAuthUser, isClinicalRole } from '@/lib/auth-helpers';

// GET /api/settings/email-integrations
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthUser();

    // Email integrations are clinic-config — owner + dentists only.
    if (!isClinicalRole(auth.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const integrations = await getUserEmailIntegrations(auth.userId, auth.tenantId);

    return createSuccessResponse({ integrations });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch email integrations');
  }
}

