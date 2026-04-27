import { NextRequest, NextResponse } from 'next/server';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';
import { getClientsData } from '@/lib/server/clients';
import { findOrCreateClient } from '@/lib/client-matching';
import { handleApiError, createSuccessResponse } from '@/lib/error-handler';
import { getAuthUser } from '@/lib/auth-helpers';
import { resolveCalendarOwnerScope } from '@/lib/calendar-owner-scope';
import { resolveBookableDentistForCalendar } from '@/lib/calendar-dentists';
import { getCached } from '@/lib/redis';
import { clientsListCacheKey, invalidateReadCaches } from '@/lib/cache-keys';
import { checkWriteRateLimit } from '@/lib/rate-limit';
import { logDataAccess } from '@/lib/audit';
import { createClientSchema } from '@/lib/validation';
import { logger } from '@/lib/logger';

// GET /api/clients
// ?calendarId=N               → scope to calendar owner's clients
// ?calendarId=N&dentistUserId=M → scope to dentist M's clients (must be bookable on calendar N)
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const auth = await getAuthUser();
    const { dbUserId, email, role } = auth;
    let { userId, tenantId } = auth;

    const rawCalendarId = searchParams.get('calendarId');
    const rawDentistUserId = searchParams.get('dentistUserId');

    if (rawCalendarId) {
      const calendarId = Number.parseInt(rawCalendarId, 10);
      if (!Number.isInteger(calendarId) || calendarId <= 0) {
        return NextResponse.json({ error: 'Invalid calendarId' }, { status: 400 });
      }

      if (rawDentistUserId) {
        const dentistUserId = Number.parseInt(rawDentistUserId, 10);
        if (!Number.isInteger(dentistUserId) || dentistUserId <= 0) {
          return NextResponse.json({ error: 'Invalid dentistUserId' }, { status: 400 });
        }
        const dentist = await resolveBookableDentistForCalendar(auth, calendarId, dentistUserId);
        userId = dentist.userId;
        tenantId = dentist.tenantId;
      } else {
        const ownerScope = await resolveCalendarOwnerScope(auth, calendarId);
        userId = ownerScope.userId;
        tenantId = ownerScope.tenantId;
      }
    }
    const search = searchParams.get('search') || '';
    const sortBy = searchParams.get('sortBy') || 'last_appointment_date';
    const sortOrder = searchParams.get('sortOrder') || 'DESC';
    const rawConsentFilter = searchParams.get('consentFilter') || 'all';
    const consentFilter = ['all', 'consented', 'not_consented', 'withdrawn'].includes(rawConsentFilter)
      ? (rawConsentFilter as 'all' | 'consented' | 'not_consented' | 'withdrawn')
      : 'all';

    // Pagination parameters — clamp to prevent full-table-scan DoS.
    const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20') || 20));
    const cacheKey = clientsListCacheKey(
      { tenantId, userId },
      { search, sortBy, sortOrder, page, limit, consentFilter }
    );
    const data = await getCached(cacheKey, 120, async () =>
      getClientsData({
        userId,
        tenantId,
        search,
        sortBy,
        sortOrder,
        page,
        limit,
        consentFilter,
      })
    );

    await logDataAccess({
      actorUserId: dbUserId,
      actorEmail: email,
      actorRole: role,
      tenantId,
      targetType: 'client.collection',
      route: '/api/clients',
      request,
      metadata: {
        search: search || null,
        sortBy,
        sortOrder,
        page,
        limit,
        consentFilter: consentFilter !== 'all' ? consentFilter : null,
      },
    });

    return createSuccessResponse(data);
  } catch (error) {
    return handleApiError(error, 'Failed to fetch clients');
  }
}

// POST /api/clients - Create a new client (always in caller's own tenant)
// Share recipients cannot create clients in the calendar owner's tenant via
// this endpoint — patient creation in shared calendars must be done by the owner.
export async function POST(request: NextRequest) {
  try {
    const { userId, tenantId } = await getAuthUser();
    const limited = await checkWriteRateLimit(userId);
    if (limited) return limited;
    const db = await getMongoDbOrThrow();
    const body = await request.json();

    // Validate input
    const validationResult = createClientSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: 'Invalid input',
          details: validationResult.error.errors,
        },
        { status: 400 }
      );
    }
    const { name, email, phone, notes, consent_given, consent_date, consent_method, is_minor, parent_guardian_name } = validationResult.data;

    // Use findOrCreateClient to avoid duplicates
    let client;
    try {
      client = await findOrCreateClient(
        userId,
        tenantId,
        name,
        email,
        phone
      );
    } catch (error: any) {
      logger.error('Error in findOrCreateClient', error instanceof Error ? error : new Error(String(error)), { name, email, phone });
      return handleApiError(error, 'Failed to create client');
    }

    const updates: Record<string, unknown> = {};

    if (notes !== undefined) {
      updates.notes = notes;
    }
    if (consent_given !== undefined) updates.consent_given = consent_given;
    if (consent_date !== undefined) updates.consent_date = consent_date;
    if (consent_method !== undefined) updates.consent_method = consent_method;
    if (is_minor !== undefined) updates.is_minor = is_minor;
    if (parent_guardian_name !== undefined) updates.parent_guardian_name = parent_guardian_name;

    let responseClient = client;
    if (Object.keys(updates).length > 0) {
      updates.updated_at = new Date().toISOString();
      await db.collection('clients').updateOne(
        { id: client.id, tenant_id: tenantId },
        { $set: updates }
      );
      responseClient = {
        ...client,
        ...updates,
      };
    }
    await invalidateReadCaches({ tenantId, userId });
    return createSuccessResponse({
      client: responseClient,
    }, 201);
  } catch (error) {
    return handleApiError(error, 'Failed to create client');
  }
}
