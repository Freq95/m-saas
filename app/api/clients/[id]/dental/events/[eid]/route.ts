import { NextRequest } from 'next/server';
import { getAuthUser, isClinicalRole } from '@/lib/auth-helpers';
import { handleApiError, createSuccessResponse, createErrorResponse } from '@/lib/error-handler';
import { resolveClientScopeForClient } from '@/lib/client-permissions';
import { checkUpdateRateLimit } from '@/lib/rate-limit';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';
import { updateDentalEventSchema } from '@/lib/dental/schemas';
import { recomputeToothState } from '@/lib/dental/recompute';
import { getDentalData } from '@/lib/server/dental';

type RouteParams = { params: Promise<{ id: string; eid: string }> };

type LoadResult =
  | { ok: false; error: string; status: number }
  | {
      ok: true;
      scope: NonNullable<Awaited<ReturnType<typeof resolveClientScopeForClient>>>;
      event: { tooth_fdi: number } & Record<string, unknown>;
    };

async function loadScopedEvent(auth: Awaited<ReturnType<typeof getAuthUser>>, clientId: number, eventId: number): Promise<LoadResult> {
  const scope = await resolveClientScopeForClient(auth, clientId);
  if (!scope) return { ok: false, error: 'Client not found', status: 404 };

  const db = await getMongoDbOrThrow();
  const event = await db.collection('tooth_events').findOne({
    id: eventId,
    tenant_id: scope.tenantId,
    user_id: scope.userId,
    client_id: clientId,
  });
  if (!event) return { ok: false, error: 'Event not found', status: 404 };
  return { ok: true, scope, event: event as unknown as { tooth_fdi: number } & Record<string, unknown> };
}

export async function PATCH(request: NextRequest, props: RouteParams) {
  const params = await props.params;
  try {
    const auth = await getAuthUser();
    if (!isClinicalRole(auth.role)) {
      return createErrorResponse('Doar medicii pot modifica interventii dentare.', 403);
    }
    const limited = await checkUpdateRateLimit(auth.userId);
    if (limited) return limited;

    const clientId = parseInt(params.id, 10);
    const eventId = parseInt(params.eid, 10);
    if (isNaN(clientId) || clientId <= 0 || isNaN(eventId) || eventId <= 0) {
      return createErrorResponse('Invalid identifiers', 400);
    }

    const loaded = await loadScopedEvent(auth, clientId, eventId);
    if (!loaded.ok) return createErrorResponse(loaded.error, loaded.status);

    const body = await request.json();
    const parsed = updateDentalEventSchema.safeParse(body);
    if (!parsed.success) return createErrorResponse('Invalid input', 400, parsed.error.issues);

    const db = await getMongoDbOrThrow();
    const updates: Record<string, unknown> = {};
    if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes;
    if (parsed.data.metadata !== undefined) updates.metadata = parsed.data.metadata;
    if (parsed.data.occurred_at !== undefined) updates.occurred_at = parsed.data.occurred_at;
    if (parsed.data.severity !== undefined) updates.severity = parsed.data.severity;
    if (parsed.data.action !== undefined) updates.action = parsed.data.action;

    if (Object.keys(updates).length === 0) {
      return createErrorResponse('No fields to update', 400);
    }

    const updated = await db.collection('tooth_events').updateOne(
      {
        id: eventId,
        tenant_id: loaded.scope.tenantId,
        user_id: loaded.scope.userId,
        client_id: clientId,
        deleted_at: { $exists: false },
      },
      { $set: updates }
    );
    if (updated.matchedCount === 0) return createErrorResponse('Event not found', 404);
    await recomputeToothState(
      { tenantId: loaded.scope.tenantId, userId: loaded.scope.userId, clientId },
      loaded.event.tooth_fdi as number
    );

    const data = await getDentalData(clientId, loaded.scope.tenantId, loaded.scope.userId);
    return createSuccessResponse({ dental: data });
  } catch (error) {
    return handleApiError(error, 'Failed to update dental event');
  }
}

export async function DELETE(_request: NextRequest, props: RouteParams) {
  const params = await props.params;
  try {
    const auth = await getAuthUser();
    if (!isClinicalRole(auth.role)) {
      return createErrorResponse('Doar medicii pot șterge interventii dentare.', 403);
    }
    const limited = await checkUpdateRateLimit(auth.userId);
    if (limited) return limited;

    const clientId = parseInt(params.id, 10);
    const eventId = parseInt(params.eid, 10);
    if (isNaN(clientId) || clientId <= 0 || isNaN(eventId) || eventId <= 0) {
      return createErrorResponse('Invalid identifiers', 400);
    }

    const loaded = await loadScopedEvent(auth, clientId, eventId);
    if (!loaded.ok) return createErrorResponse(loaded.error, loaded.status);

    const db = await getMongoDbOrThrow();
    const deleted = await db.collection('tooth_events').updateOne(
      {
        id: eventId,
        tenant_id: loaded.scope.tenantId,
        user_id: loaded.scope.userId,
        client_id: clientId,
        deleted_at: { $exists: false },
      },
      { $set: { deleted_at: new Date().toISOString() } }
    );
    if (deleted.matchedCount === 0) return createErrorResponse('Event not found', 404);
    await recomputeToothState(
      { tenantId: loaded.scope.tenantId, userId: loaded.scope.userId, clientId },
      loaded.event.tooth_fdi as number
    );

    const data = await getDentalData(clientId, loaded.scope.tenantId, loaded.scope.userId);
    return createSuccessResponse({ dental: data });
  } catch (error) {
    return handleApiError(error, 'Failed to delete dental event');
  }
}
