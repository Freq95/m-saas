import { NextRequest } from 'next/server';
import { getAuthUser, isClinicalRole } from '@/lib/auth-helpers';
import { resolveClientScopeForClient } from '@/lib/client-permissions';
import { createErrorResponse, createSuccessResponse, handleApiError } from '@/lib/error-handler';
import { checkWriteRateLimit } from '@/lib/rate-limit';
import { getMongoDbOrThrow, stripMongoId } from '@/lib/db/mongo-utils';
import { logDataAccess } from '@/lib/audit';
import { isStorageConfigured } from '@/lib/storage';
import {
  generateTreatmentPlanPdfFile,
  getTreatmentPlan,
  normalizeRoPhone,
  resolveOrIssuePublicLink,
  revokeTreatmentPlanPublicLink,
} from '@/lib/server/treatment-plans';
import { shareTreatmentPlanSchema } from '@/lib/treatment-plans/schemas';

export const runtime = 'nodejs';

export async function POST(request: NextRequest, props: { params: Promise<{ id: string; planId: string }> }) {
  const params = await props.params;
  try {
    const auth = await getAuthUser();
    if (!isClinicalRole(auth.role)) {
      return createErrorResponse('Doar medicii pot trimite planuri de tratament.', 403);
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

    const parsed = shareTreatmentPlanSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return createErrorResponse('Invalid input', 400, parsed.error.issues);
    }
    const { action, token } = parsed.data;

    const db = await getMongoDbOrThrow();
    const client = await db.collection('clients').findOne({
      id: clientId,
      tenant_id: scope.tenantId,
      deleted_at: { $exists: false },
    });
    if (!client) return createErrorResponse('Client not found', 404);

    const planScope = { tenantId: scope.tenantId, userId: scope.userId, clientId };
    let plan = await getTreatmentPlan(planScope, planId);
    if (!plan) return createErrorResponse('Treatment plan not found', 404);

    if (action === 'revoke') {
      const updated = await revokeTreatmentPlanPublicLink(planScope, planId);
      await logDataAccess({
        actorUserId: auth.dbUserId,
        actorEmail: auth.email,
        actorRole: auth.role,
        tenantId: scope.tenantId,
        targetType: 'client.treatment_plan_share',
        targetId: planId,
        route: `/api/clients/${params.id}/treatment-plans/${params.planId}/share`,
        request,
        metadata: { action: 'revoke' },
      });
      return createSuccessResponse({ plan: updated ? stripMongoId(updated) : plan });
    }

    // The shared link points at the stored PDF, so it must exist first.
    if (!plan.pdf_file_id) {
      plan = await generateTreatmentPlanPdfFile(planScope, planId);
      if (!plan) return createErrorResponse('Treatment plan not found', 404);
    }

    const link = await resolveOrIssuePublicLink(planScope, planId, token);
    if (!link) {
      return createErrorResponse('Linkul pentru plan nu a putut fi creat.', 500);
    }
    const publicUrl = new URL(`/plan/${link.token}`, request.nextUrl.origin).toString();
    const firstName = String(client.name || 'Pacient').trim().split(/\s+/)[0] || 'Pacient';
    const whatsappPhone = normalizeRoPhone(client.phone);

    if (action === 'link') {
      return createSuccessResponse({
        url: publicUrl,
        token: link.token,
        expiresAt: link.expiresAt,
        patient: {
          firstName,
          email: client.email || null,
          phone: client.phone || null,
          whatsappReady: Boolean(whatsappPhone),
        },
      });
    }

    // action === 'whatsapp'
    if (!whatsappPhone) {
      return createErrorResponse(
        'Pacientul nu are un număr de telefon valid. Adaugă-l în fișa pacientului.',
        400
      );
    }

    const message =
      `Bună ziua, ${firstName}! Planul dumneavoastră de tratament de la ${plan.clinic_name_snapshot} ` +
      `este disponibil aici: ${publicUrl} — îl puteți vizualiza și descărca direct de pe telefon. O zi bună!`;
    const waUrl = `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(message)}`;

    await logDataAccess({
      actorUserId: auth.dbUserId,
      actorEmail: auth.email,
      actorRole: auth.role,
      tenantId: scope.tenantId,
      targetType: 'client.treatment_plan_share',
      targetId: planId,
      route: `/api/clients/${params.id}/treatment-plans/${params.planId}/share`,
      request,
      metadata: { via: 'whatsapp' },
    });

    return createSuccessResponse({
      url: publicUrl,
      waUrl,
      plan,
    });
  } catch (error) {
    return handleApiError(error, 'Failed to share treatment plan');
  }
}
