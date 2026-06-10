import { NextRequest } from 'next/server';
import { getAuthUser, isClinicalRole } from '@/lib/auth-helpers';
import { handleApiError, createSuccessResponse, createErrorResponse } from '@/lib/error-handler';
import { resolveClientScopeForClient } from '@/lib/client-permissions';
import { checkWriteRateLimit } from '@/lib/rate-limit';
import { getMongoDbOrThrow, getNextNumericId, stripMongoId, type FlexDoc } from '@/lib/db/mongo-utils';
import { createDentalEventSchema } from '@/lib/dental/schemas';
import { recomputeToothState } from '@/lib/dental/recompute';
import { getDentalData } from '@/lib/server/dental';

// POST /api/clients/[id]/dental/events — record a new dental event for a tooth.
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const auth = await getAuthUser();
    if (!isClinicalRole(auth.role)) {
      return createErrorResponse('Doar medicii pot inregistra interventii dentare.', 403);
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
    const parsed = createDentalEventSchema.safeParse(body);
    if (!parsed.success) {
      return createErrorResponse('Invalid input', 400, parsed.error.issues);
    }

    const db = await getMongoDbOrThrow();
    const now = new Date().toISOString();
    const eventId = await getNextNumericId('tooth_events');

    const doc = {
      _id: eventId,
      id: eventId,
      tenant_id: scope.tenantId,
      user_id: scope.userId,
      client_id: clientId,
      tooth_fdi: parsed.data.tooth_fdi,
      surfaces: parsed.data.surfaces,
      issue_type: parsed.data.issue_type,
      action: parsed.data.action,
      severity: parsed.data.severity,
      doctor_user_id: auth.userId,
      doctor_name_snapshot: auth.name,
      occurred_at: parsed.data.occurred_at ?? now,
      notes: parsed.data.notes,
      metadata: parsed.data.metadata,
      created_at: now,
    };

    await db.collection<FlexDoc>('tooth_events').insertOne(doc);
    await recomputeToothState(
      { tenantId: scope.tenantId, userId: scope.userId, clientId },
      parsed.data.tooth_fdi
    );

    const data = await getDentalData(clientId, scope.tenantId, scope.userId);
    return createSuccessResponse({ event: stripMongoId(doc), dental: data }, 201);
  } catch (error) {
    return handleApiError(error, 'Failed to create dental event');
  }
}
