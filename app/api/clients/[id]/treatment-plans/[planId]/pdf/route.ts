import { NextRequest } from 'next/server';
import { getAuthUser, isClinicalRole } from '@/lib/auth-helpers';
import { resolveClientScopeForClient } from '@/lib/client-permissions';
import { createErrorResponse, createSuccessResponse, handleApiError } from '@/lib/error-handler';
import { checkWriteRateLimit } from '@/lib/rate-limit';
import { invalidateReadCaches } from '@/lib/cache-keys';
import { logDataAccess } from '@/lib/audit';
import { generateTreatmentPlanPdfFile } from '@/lib/server/treatment-plans';
import { isStorageConfigured } from '@/lib/storage';

export const runtime = 'nodejs';

export async function POST(request: NextRequest, props: { params: Promise<{ id: string; planId: string }> }) {
  const params = await props.params;
  try {
    const auth = await getAuthUser();
    if (!isClinicalRole(auth.role)) {
      return createErrorResponse('Doar medicii pot genera PDF-uri pentru planuri de tratament.', 403);
    }
    if (!isStorageConfigured()) {
      return createErrorResponse('Cloud storage is not configured.', 503);
    }
    const limited = await checkWriteRateLimit(auth.userId);
    if (limited) return limited;

    const clientId = Number.parseInt(params.id, 10);
    const planId = Number.parseInt(params.planId, 10);
    if (!Number.isInteger(clientId) || clientId <= 0 || !Number.isInteger(planId) || planId <= 0) {
      return createErrorResponse('Invalid ID', 400);
    }

    const scope = await resolveClientScopeForClient(auth, clientId);
    if (!scope) return createErrorResponse('Client not found', 404);

    const plan = await generateTreatmentPlanPdfFile({ tenantId: scope.tenantId, userId: scope.userId, clientId }, planId);
    if (!plan) return createErrorResponse('Treatment plan not found', 404);

    await logDataAccess({
      actorUserId: auth.dbUserId,
      actorEmail: auth.email,
      actorRole: auth.role,
      tenantId: scope.tenantId,
      targetType: 'client.treatment_plan_pdf',
      targetId: plan.id,
      route: `/api/clients/${params.id}/treatment-plans/${params.planId}/pdf`,
      request,
    });
    await invalidateReadCaches({ tenantId: scope.tenantId, userId: scope.userId });
    return createSuccessResponse({ plan });
  } catch (error) {
    return handleApiError(error, 'Failed to generate treatment plan PDF');
  }
}
