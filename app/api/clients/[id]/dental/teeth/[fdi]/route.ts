import { NextRequest } from 'next/server';
import { getAuthUser, isClinicalRole } from '@/lib/auth-helpers';
import { handleApiError, createSuccessResponse, createErrorResponse } from '@/lib/error-handler';
import { resolveClientScopeForClient } from '@/lib/client-permissions';
import { checkUpdateRateLimit } from '@/lib/rate-limit';
import { fdiIsValid } from '@/lib/dental/constants';
import { updateToothStatusSchema } from '@/lib/dental/schemas';
import { recomputeToothState } from '@/lib/dental/recompute';
import { getDentalData } from '@/lib/server/dental';

// PATCH /api/clients/[id]/dental/teeth/[fdi] — change tooth status (missing / implant / crown / present).
export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string; fdi: string }> }) {
  const params = await props.params;
  try {
    const auth = await getAuthUser();
    if (!isClinicalRole(auth.role)) {
      return createErrorResponse('Doar medicii pot modifica starea dintilor.', 403);
    }
    const limited = await checkUpdateRateLimit(auth.userId);
    if (limited) return limited;

    const clientId = parseInt(params.id, 10);
    const fdi = parseInt(params.fdi, 10);
    if (isNaN(clientId) || clientId <= 0 || !fdiIsValid(fdi)) {
      return createErrorResponse('Invalid identifiers', 400);
    }

    const scope = await resolveClientScopeForClient(auth, clientId);
    if (!scope) return createErrorResponse('Client not found', 404);

    const body = await request.json();
    const parsed = updateToothStatusSchema.safeParse(body);
    if (!parsed.success) return createErrorResponse('Invalid input', 400, parsed.error.issues);

    await recomputeToothState(
      { tenantId: scope.tenantId, userId: scope.userId, clientId },
      fdi,
      parsed.data.status
    );

    const data = await getDentalData(clientId, scope.tenantId, scope.userId);
    return createSuccessResponse({ dental: data });
  } catch (error) {
    return handleApiError(error, 'Failed to update tooth status');
  }
}
