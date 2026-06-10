import { NextRequest } from 'next/server';
import { getAuthUser, isClinicalRole } from '@/lib/auth-helpers';
import { handleApiError, createSuccessResponse, createErrorResponse } from '@/lib/error-handler';
import { resolveClientScopeForClient } from '@/lib/client-permissions';
import { checkWriteRateLimit } from '@/lib/rate-limit';
import { updateSurgeryGroupSchema } from '@/lib/dental/schemas';
import { updateSurgeryGroup, deleteSurgeryGroup } from '@/lib/server/surgery';
import { getDentalData } from '@/lib/server/dental';

type RouteParams = { params: Promise<{ id: string; gid: string }> };

function parseIds(params: { id: string; gid: string }) {
  const clientId = parseInt(params.id, 10);
  const groupId = parseInt(params.gid, 10);
  if (isNaN(clientId) || clientId <= 0 || isNaN(groupId) || groupId <= 0) return null;
  return { clientId, groupId };
}

// PATCH /api/clients/[id]/dental/surgery/[gid] — update tooth list and/or comment.
export async function PATCH(request: NextRequest, props: RouteParams) {
  const params = await props.params;
  try {
    const auth = await getAuthUser();
    if (!isClinicalRole(auth.role)) {
      return createErrorResponse('Doar medicii pot modifica intervenții.', 403);
    }
    const limited = await checkWriteRateLimit(auth.userId);
    if (limited) return limited;

    const ids = parseIds(params);
    if (!ids) return createErrorResponse('Invalid ID', 400);

    const scope = await resolveClientScopeForClient(auth, ids.clientId);
    if (!scope) return createErrorResponse('Client not found', 404);

    const body = await request.json();
    const parsed = updateSurgeryGroupSchema.safeParse(body);
    if (!parsed.success) {
      return createErrorResponse('Invalid input', 400, parsed.error.issues);
    }

    const updated = await updateSurgeryGroup(
      { tenantId: scope.tenantId, userId: scope.userId, clientId: ids.clientId },
      ids.groupId,
      parsed.data
    );
    if (!updated) return createErrorResponse('Surgery group not found', 404);

    const data = await getDentalData(ids.clientId, scope.tenantId, scope.userId);
    return createSuccessResponse({ surgery_group: updated, dental: data });
  } catch (error) {
    return handleApiError(error, 'Failed to update surgery group');
  }
}

// DELETE /api/clients/[id]/dental/surgery/[gid] — remove a surgery annotation.
export async function DELETE(_request: NextRequest, props: RouteParams) {
  const params = await props.params;
  try {
    const auth = await getAuthUser();
    if (!isClinicalRole(auth.role)) {
      return createErrorResponse('Doar medicii pot șterge intervenții.', 403);
    }
    const limited = await checkWriteRateLimit(auth.userId);
    if (limited) return limited;

    const ids = parseIds(params);
    if (!ids) return createErrorResponse('Invalid ID', 400);

    const scope = await resolveClientScopeForClient(auth, ids.clientId);
    if (!scope) return createErrorResponse('Client not found', 404);

    const deleted = await deleteSurgeryGroup(
      { tenantId: scope.tenantId, userId: scope.userId, clientId: ids.clientId },
      ids.groupId
    );
    if (!deleted) return createErrorResponse('Surgery group not found', 404);

    const data = await getDentalData(ids.clientId, scope.tenantId, scope.userId);
    return createSuccessResponse({ dental: data });
  } catch (error) {
    return handleApiError(error, 'Failed to delete surgery group');
  }
}
