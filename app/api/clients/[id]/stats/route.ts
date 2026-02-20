import { NextRequest } from 'next/server';
import { handleApiError, createSuccessResponse, createErrorResponse } from '@/lib/error-handler';
import { getClientStatsData } from '@/lib/server/client-profile';
import { getAuthUser } from '@/lib/auth-helpers';

// GET /api/clients/[id]/stats - Get detailed statistics for a client
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId, tenantId } = await getAuthUser();
    const clientId = parseInt(params.id);

    // Validate ID
    if (isNaN(clientId) || clientId <= 0) {
      return createErrorResponse('Invalid client ID', 400);
    }
    const stats = await getClientStatsData(clientId, tenantId, userId);
    if (!stats) {
      return createErrorResponse('Client not found', 404);
    }

    return createSuccessResponse({ stats });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch client stats');
  }
}

