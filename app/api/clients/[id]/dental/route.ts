import { NextRequest } from 'next/server';
import { getAuthUser } from '@/lib/auth-helpers';
import { handleApiError, createSuccessResponse, createErrorResponse } from '@/lib/error-handler';
import { resolveClientScopeForClient } from '@/lib/client-permissions';
import { getDentalData } from '@/lib/server/dental';

// GET /api/clients/[id]/dental — full odontogram snapshot for a client.
export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const auth = await getAuthUser();
    const clientId = parseInt(params.id, 10);
    if (isNaN(clientId) || clientId <= 0) {
      return createErrorResponse('Invalid client ID', 400);
    }

    const scope = await resolveClientScopeForClient(auth, clientId);
    if (!scope) return createErrorResponse('Client not found', 404);

    const data = await getDentalData(clientId, scope.tenantId, scope.userId);
    return createSuccessResponse({ dental: data });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch dental chart');
  }
}
