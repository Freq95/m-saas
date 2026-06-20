import { NextRequest } from 'next/server';
import { getAuthUser, isClinicalRole } from '@/lib/auth-helpers';
import { resolveClientScopeForClient } from '@/lib/client-permissions';
import { createErrorResponse, createSuccessResponse, handleApiError } from '@/lib/error-handler';
import { checkWriteRateLimit } from '@/lib/rate-limit';
import { getMongoDbOrThrow, stripMongoId } from '@/lib/db/mongo-utils';
import { logDataAccess } from '@/lib/audit';
import { sendEmail } from '@/lib/email';
import { getStorageProvider, isStorageConfigured } from '@/lib/storage';
import {
  generateTreatmentPlanPdfFile,
  getTreatmentPlan,
  resolveOrIssuePublicLink,
} from '@/lib/server/treatment-plans';
import { sendTreatmentPlanEmailSchema } from '@/lib/treatment-plans/schemas';

export const runtime = 'nodejs';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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

    const body = await request.json().catch(() => ({}));
    const parsed = sendTreatmentPlanEmailSchema.safeParse(body);
    if (!parsed.success) {
      return createErrorResponse('Invalid input', 400, parsed.error.issues);
    }

    const db = await getMongoDbOrThrow();
    const client = await db.collection('clients').findOne({
      id: clientId,
      tenant_id: scope.tenantId,
      deleted_at: { $exists: false },
    });
    if (!client) return createErrorResponse('Client not found', 404);

    let plan = await getTreatmentPlan({ tenantId: scope.tenantId, userId: scope.userId, clientId }, planId);
    if (!plan) return createErrorResponse('Treatment plan not found', 404);
    if (!plan.pdf_file_id) {
      plan = await generateTreatmentPlanPdfFile({ tenantId: scope.tenantId, userId: scope.userId, clientId }, planId);
      if (!plan) return createErrorResponse('Treatment plan not found', 404);
    }

    const to = parsed.data.to || client.email;
    if (!to) {
      return createErrorResponse('Pacientul nu are email. Completează o adresă pentru trimitere.', 400);
    }

    const file = await db.collection('client_files').findOne({
      id: plan.pdf_file_id,
      tenant_id: scope.tenantId,
      client_id: clientId,
    });
    if (!file?.storage_key) {
      return createErrorResponse('PDF-ul planului nu este disponibil.', 404);
    }

    const link = await resolveOrIssuePublicLink({ tenantId: scope.tenantId, userId: scope.userId, clientId }, planId, parsed.data.token);
    if (!link) {
      return createErrorResponse('Linkul pentru plan nu a putut fi creat.', 500);
    }
    const publicUrl = new URL(`/plan/${link.token}`, request.nextUrl.origin).toString();
    const optionalMessage = parsed.data.message
      ? `<p>${escapeHtml(parsed.data.message).replace(/\n/g, '<br>')}</p>`
      : '';
    const attachments = parsed.data.attachPdf
      ? [{
        filename: file.original_filename || 'Plan-de-tratament.pdf',
        content: await getStorageProvider().download(String(file.storage_key)),
        contentType: 'application/pdf',
      }]
      : undefined;
    const result = await sendEmail({
      to,
      subject: `Plan de tratament - ${plan.clinic_name_snapshot}`,
      html: `
        <p>Bună ziua, ${escapeHtml(client.name || '')}</p>
        <p>Gasiti mai jos planul de tratament transmis de ${escapeHtml(plan.clinic_name_snapshot)}.</p>
        ${optionalMessage}
        <p>
          <a href="${publicUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:6px;font-weight:700;">
            Deschide planul de tratament
          </a>
        </p>
        <p>Linkul este valabil până la ${new Date(link.expiresAt).toLocaleDateString('ro-RO')}.</p>
        <p>Cu respect,<br>${escapeHtml(plan.doctor_name_snapshot)}</p>
      `,
      attachments,
    });
    if (!result.ok) {
      return createErrorResponse('Emailul nu a putut fi trimis.', 502, result.reason);
    }

    const now = new Date().toISOString();
    const updated = await db.collection('treatment_plans').findOneAndUpdate(
      {
        id: planId,
        tenant_id: scope.tenantId,
        user_id: scope.userId,
        client_id: clientId,
        deleted_at: { $exists: false },
      },
      { $set: { status: 'sent', sent_at: now, sent_to_email: to, sent_via: 'email', updated_at: now } },
      { returnDocument: 'after' }
    );

    await logDataAccess({
      actorUserId: auth.dbUserId,
      actorEmail: auth.email,
      actorRole: auth.role,
      tenantId: scope.tenantId,
      targetType: 'client.treatment_plan_email',
      targetId: planId,
      route: `/api/clients/${params.id}/treatment-plans/${params.planId}/send-email`,
      request,
      metadata: { to },
    });

    return createSuccessResponse({ plan: updated ? stripMongoId(updated) : plan });
  } catch (error) {
    return handleApiError(error, 'Failed to send treatment plan email');
  }
}
