import { NextRequest } from 'next/server';
import { getAuthUser, isClinicalRole } from '@/lib/auth-helpers';
import { createErrorResponse, createSuccessResponse, handleApiError } from '@/lib/error-handler';
import { checkUpdateRateLimit } from '@/lib/rate-limit';
import { invalidateReadCaches } from '@/lib/cache-keys';
import {
  getTreatmentPlanSettingsPayload,
  upsertTreatmentPlanSettings,
} from '@/lib/server/treatment-plans';
import { treatmentPlanSettingsSchema } from '@/lib/treatment-plans/schemas';

export async function GET(_request: NextRequest) {
  try {
    const auth = await getAuthUser();
    if (!isClinicalRole(auth.role)) {
      return createErrorResponse('Forbidden', 403);
    }
    return createSuccessResponse(await getTreatmentPlanSettingsPayload(auth));
  } catch (error) {
    return handleApiError(error, 'Failed to fetch treatment plan settings');
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await getAuthUser();
    if (!isClinicalRole(auth.role)) {
      return createErrorResponse('Forbidden', 403);
    }
    const limited = await checkUpdateRateLimit(auth.userId);
    if (limited) return limited;

    const parsed = treatmentPlanSettingsSchema.safeParse(await request.json());
    if (!parsed.success) {
      return createErrorResponse('Invalid input', 400, parsed.error.issues);
    }

    const payload = await upsertTreatmentPlanSettings(auth, parsed.data);
    await invalidateReadCaches({ tenantId: auth.tenantId, userId: auth.userId });
    return createSuccessResponse(payload);
  } catch (error) {
    return handleApiError(error, 'Failed to update treatment plan settings');
  }
}
