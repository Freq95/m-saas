import { NextRequest } from 'next/server';
import { getAuthUser } from '@/lib/auth-helpers';
import { handleApiError, createSuccessResponse, createErrorResponse } from '@/lib/error-handler';
import { resolveClientScopeForClient } from '@/lib/client-permissions';
import { getMongoDbOrThrow, stripMongoId } from '@/lib/db/mongo-utils';
import { fdiIsValid } from '@/lib/dental/constants';
import type { ToothEventDoc } from '@/lib/server/dental';

// GET /api/clients/[id]/dental/teeth/[fdi]/events — full event history for one tooth.
// Used by the timeline modal; lazy-loaded so the main odontogram payload stays light.
export async function GET(_request: NextRequest, props: { params: Promise<{ id: string; fdi: string }> }) {
  const params = await props.params;
  try {
    const auth = await getAuthUser();
    const clientId = parseInt(params.id, 10);
    const fdi = parseInt(params.fdi, 10);
    if (isNaN(clientId) || clientId <= 0 || !fdiIsValid(fdi)) {
      return createErrorResponse('Invalid identifiers', 400);
    }

    const scope = await resolveClientScopeForClient(auth, clientId);
    if (!scope) return createErrorResponse('Client not found', 404);

    const db = await getMongoDbOrThrow();
    const events = await db
      .collection('tooth_events')
      .find({
        tenant_id: scope.tenantId,
        user_id: scope.userId,
        client_id: clientId,
        tooth_fdi: fdi,
        deleted_at: { $exists: false },
      })
      .sort({ occurred_at: -1, created_at: -1 })
      .toArray();

    return createSuccessResponse({
      events: events.map((doc) => stripMongoId(doc)) as ToothEventDoc[],
    });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch tooth events');
  }
}
