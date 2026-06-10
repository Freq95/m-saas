import { NextRequest } from 'next/server';
import { getAuthUser, isClinicalRole } from '@/lib/auth-helpers';
import { handleApiError, createSuccessResponse, createErrorResponse } from '@/lib/error-handler';
import { resolveClientScopeForClient } from '@/lib/client-permissions';
import { checkWriteRateLimit } from '@/lib/rate-limit';
import { createBridgeGroupSchema } from '@/lib/dental/schemas';
import { createBridgeGroup } from '@/lib/server/bridges';
import { getDentalData } from '@/lib/server/dental';

// POST /api/clients/[id]/dental/bridges — create a new multi-tooth bridge group.
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const auth = await getAuthUser();
    if (!isClinicalRole(auth.role)) {
      return createErrorResponse('Doar medicii pot crea punți.', 403);
    }
    const limited = await checkWriteRateLimit(auth.userId);
    if (limited) return limited;

    const clientId = parseInt(params.id, 10);
    if (isNaN(clientId) || clientId <= 0) {
      return createErrorResponse('Invalid client ID', 400);
    }

    const scope = await resolveClientScopeForClient(auth, clientId);
    if (!scope) return createErrorResponse('Client not found', 404);

    const body = await request.json();
    const parsed = createBridgeGroupSchema.safeParse(body);
    if (!parsed.success) {
      return createErrorResponse('Invalid input', 400, parsed.error.issues);
    }

    const group = await createBridgeGroup(
      { tenantId: scope.tenantId, userId: scope.userId, clientId },
      { doctorUserId: auth.userId, doctorName: auth.name },
      parsed.data
    );
    const data = await getDentalData(clientId, scope.tenantId, scope.userId);
    return createSuccessResponse({ bridge_group: group, dental: data }, 201);
  } catch (error) {
    return handleApiError(error, 'Failed to create bridge group');
  }
}
