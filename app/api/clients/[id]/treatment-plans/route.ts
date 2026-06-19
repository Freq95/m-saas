import { NextRequest } from 'next/server';
import { getAuthUser, isClinicalRole } from '@/lib/auth-helpers';
import { resolveClientScopeForClient } from '@/lib/client-permissions';
import { createErrorResponse, createSuccessResponse, handleApiError } from '@/lib/error-handler';
import { checkWriteRateLimit } from '@/lib/rate-limit';
import { invalidateReadCaches } from '@/lib/cache-keys';
import {
  createTreatmentPlan,
  generateTreatmentPlanPdfFile,
  getTreatmentPlanSettings,
  listTreatmentPlanDentists,
  listTreatmentPlans,
} from '@/lib/server/treatment-plans';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';
import { createPlanSchema } from '@/lib/treatment-plans/schemas';
import { logger } from '@/lib/logger';

// PDFs are generated on save (@react-pdf/renderer is Node-only).
export const runtime = 'nodejs';

export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const auth = await getAuthUser();
    const clientId = Number.parseInt(params.id, 10);
    if (!Number.isInteger(clientId) || clientId <= 0) {
      return createErrorResponse('Invalid client ID', 400);
    }

    const scope = await resolveClientScopeForClient(auth, clientId);
    if (!scope) return createErrorResponse('Client not found', 404);

    const db = await getMongoDbOrThrow();
    const [plans, client, dentists, settings] = await Promise.all([
      listTreatmentPlans({ tenantId: scope.tenantId, userId: scope.userId, clientId }),
      db.collection('clients').findOne({ id: clientId, tenant_id: scope.tenantId }),
      listTreatmentPlanDentists(auth),
      getTreatmentPlanSettings(scope.tenantId),
    ]);

    return createSuccessResponse({
      plans,
      client: client ? { id: client.id, name: client.name, email: client.email || null, phone: client.phone || null } : null,
      dentists,
      settings,
      canEdit: isClinicalRole(auth.role),
    });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch treatment plans');
  }
}

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const auth = await getAuthUser();
    if (!isClinicalRole(auth.role)) {
      return createErrorResponse('Doar medicii pot crea planuri de tratament.', 403);
    }
    const limited = await checkWriteRateLimit(auth.userId);
    if (limited) return limited;

    const clientId = Number.parseInt(params.id, 10);
    if (!Number.isInteger(clientId) || clientId <= 0) {
      return createErrorResponse('Invalid client ID', 400);
    }

    const scope = await resolveClientScopeForClient(auth, clientId);
    if (!scope) return createErrorResponse('Client not found', 404);

    const parsed = createPlanSchema.safeParse(await request.json());
    if (!parsed.success) {
      return createErrorResponse('Invalid input', 400, parsed.error.issues);
    }

    let plan = await createTreatmentPlan(
      { tenantId: scope.tenantId, userId: scope.userId, clientId },
      auth,
      parsed.data
    );
    // Generate the PDF up front so preview/download/share work immediately and
    // the user never has to remember a separate "Generează PDF" step. Non-fatal.
    if (plan.items.length > 0) {
      try {
        const withPdf = await generateTreatmentPlanPdfFile(
          { tenantId: scope.tenantId, userId: scope.userId, clientId },
          plan.id
        );
        if (withPdf) plan = withPdf;
      } catch (error) {
        logger.warn('Treatment plan: PDF auto-generation failed on create', {
          planId: plan.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    await invalidateReadCaches({ tenantId: scope.tenantId, userId: scope.userId });
    return createSuccessResponse({ plan }, 201);
  } catch (error) {
    return handleApiError(error, 'Failed to create treatment plan');
  }
}
