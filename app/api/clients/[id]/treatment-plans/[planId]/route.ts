import { NextRequest } from 'next/server';
import { getAuthUser, isClinicalRole } from '@/lib/auth-helpers';
import { resolveClientScopeForClient } from '@/lib/client-permissions';
import { createErrorResponse, createSuccessResponse, handleApiError } from '@/lib/error-handler';
import { checkUpdateRateLimit } from '@/lib/rate-limit';
import { invalidateReadCaches } from '@/lib/cache-keys';
import {
  getTreatmentPlan,
  listTreatmentPlanDentists,
  softDeleteTreatmentPlan,
  updateTreatmentPlan,
} from '@/lib/server/treatment-plans';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';
import { updatePlanSchema } from '@/lib/treatment-plans/schemas';

export const runtime = 'nodejs';

export async function GET(_request: NextRequest, props: { params: Promise<{ id: string; planId: string }> }) {
  const params = await props.params;
  try {
    const auth = await getAuthUser();
    const clientId = Number.parseInt(params.id, 10);
    const planId = Number.parseInt(params.planId, 10);
    if (!Number.isInteger(clientId) || clientId <= 0 || !Number.isInteger(planId) || planId <= 0) {
      return createErrorResponse('Invalid ID', 400);
    }

    const scope = await resolveClientScopeForClient(auth, clientId);
    if (!scope) return createErrorResponse('Client not found', 404);

    const db = await getMongoDbOrThrow();
    const [plan, client, dentists] = await Promise.all([
      getTreatmentPlan({ tenantId: scope.tenantId, userId: scope.userId, clientId }, planId),
      db.collection('clients').findOne({ id: clientId, tenant_id: scope.tenantId }),
      listTreatmentPlanDentists(auth),
    ]);
    if (!plan) return createErrorResponse('Treatment plan not found', 404);

    return createSuccessResponse({
      plan,
      client: client ? { id: client.id, name: client.name, email: client.email || null } : null,
      dentists,
      canEdit: isClinicalRole(auth.role),
    });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch treatment plan');
  }
}

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string; planId: string }> }) {
  const params = await props.params;
  try {
    const auth = await getAuthUser();
    if (!isClinicalRole(auth.role)) {
      return createErrorResponse('Doar medicii pot edita planuri de tratament.', 403);
    }
    const limited = await checkUpdateRateLimit(auth.userId);
    if (limited) return limited;

    const clientId = Number.parseInt(params.id, 10);
    const planId = Number.parseInt(params.planId, 10);
    if (!Number.isInteger(clientId) || clientId <= 0 || !Number.isInteger(planId) || planId <= 0) {
      return createErrorResponse('Invalid ID', 400);
    }

    const scope = await resolveClientScopeForClient(auth, clientId);
    if (!scope) return createErrorResponse('Client not found', 404);

    const parsed = updatePlanSchema.safeParse(await request.json());
    if (!parsed.success) {
      return createErrorResponse('Invalid input', 400, parsed.error.issues);
    }

    // updateTreatmentPlan invalidates any stale PDF when line data changes, so
    // the next share/preview regenerates it lazily — saving stays instant.
    const plan = await updateTreatmentPlan(
      { tenantId: scope.tenantId, userId: scope.userId, clientId },
      auth,
      planId,
      parsed.data
    );
    if (!plan) return createErrorResponse('Treatment plan not found', 404);

    await invalidateReadCaches({ tenantId: scope.tenantId, userId: scope.userId });
    return createSuccessResponse({ plan });
  } catch (error) {
    return handleApiError(error, 'Failed to update treatment plan');
  }
}

export async function DELETE(_request: NextRequest, props: { params: Promise<{ id: string; planId: string }> }) {
  const params = await props.params;
  try {
    const auth = await getAuthUser();
    if (!isClinicalRole(auth.role)) {
      return createErrorResponse('Doar medicii pot sterge planuri de tratament.', 403);
    }
    const limited = await checkUpdateRateLimit(auth.userId);
    if (limited) return limited;

    const clientId = Number.parseInt(params.id, 10);
    const planId = Number.parseInt(params.planId, 10);
    if (!Number.isInteger(clientId) || clientId <= 0 || !Number.isInteger(planId) || planId <= 0) {
      return createErrorResponse('Invalid ID', 400);
    }

    const scope = await resolveClientScopeForClient(auth, clientId);
    if (!scope) return createErrorResponse('Client not found', 404);

    const deleted = await softDeleteTreatmentPlan({ tenantId: scope.tenantId, userId: scope.userId, clientId }, planId);
    if (!deleted) return createErrorResponse('Treatment plan not found', 404);

    await invalidateReadCaches({ tenantId: scope.tenantId, userId: scope.userId });
    return createSuccessResponse({ success: true });
  } catch (error) {
    return handleApiError(error, 'Failed to delete treatment plan');
  }
}
