import { NextRequest, NextResponse } from 'next/server';
import { getMongoDbOrThrow, getNextNumericId, stripMongoId, type FlexDoc } from '@/lib/db/mongo-utils';
import { handleApiError, createSuccessResponse } from '@/lib/error-handler';
import { getServicesData } from '@/lib/server/calendar';
import { getAuthUser } from '@/lib/auth-helpers';
import { resolveCalendarOwnerScope } from '@/lib/calendar-owner-scope';
import { resolveBookableDentistForCalendar } from '@/lib/calendar-dentists';
import { getCached } from '@/lib/redis';
import { servicesListCacheKey, invalidateReadCaches } from '@/lib/cache-keys';
import { checkWriteRateLimit } from '@/lib/rate-limit';

// GET /api/services
// ?calendarId=N               → returns the calendar owner's services
// ?calendarId=N&dentistUserId=M → returns dentist M's services (must be bookable on calendar N)
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthUser();
    const searchParams = request.nextUrl.searchParams;
    const rawCalendarId = searchParams.get('calendarId');
    const rawDentistUserId = searchParams.get('dentistUserId');

    let targetUserId = auth.userId;
    let targetTenantId = auth.tenantId;

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
        targetUserId = dentist.userId;
        targetTenantId = dentist.tenantId;
      } else {
        const ownerScope = await resolveCalendarOwnerScope(auth, calendarId);
        targetUserId = ownerScope.userId;
        targetTenantId = ownerScope.tenantId;
      }
    }

    const cacheKey = servicesListCacheKey({ tenantId: targetTenantId, userId: targetUserId });
    const payload = await getCached(cacheKey, 1800, async () => {
      const services = await getServicesData(targetUserId, targetTenantId);
      return { services };
    });

    return createSuccessResponse(payload);
  } catch (error) {
    return handleApiError(error, 'Failed to fetch services');
  }
}

// POST /api/services - Create service
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthUser();
    const { userId, tenantId } = auth;
    const limited = await checkWriteRateLimit(userId);
    if (limited) return limited;
    const db = await getMongoDbOrThrow();
    const body = await request.json();

    // Validate input
    const { createServiceSchema } = await import('@/lib/validation');
    const validationResult = createServiceSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: 'Invalid input',
          details: validationResult.error.errors,
        },
        { status: 400 }
      );
    }

    const { name, durationMinutes, price, description } = validationResult.data;

    const now = new Date().toISOString();
    const serviceId = await getNextNumericId('services');
    const serviceDoc = {
      _id: serviceId,
      id: serviceId,
      tenant_id: tenantId,
      user_id: userId,
      name,
      duration_minutes: durationMinutes,
      price: price || null,
      description: description || null,
      created_at: now,
      updated_at: now,
    };

    await db.collection<FlexDoc>('services').insertOne(serviceDoc);
    await invalidateReadCaches({
      tenantId,
      userId,
    });

    return createSuccessResponse({ service: stripMongoId(serviceDoc) }, 201);
  } catch (error) {
    return handleApiError(error, 'Failed to create service');
  }
}
