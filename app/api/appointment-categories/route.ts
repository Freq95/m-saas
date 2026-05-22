import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-helpers';
import { getMongoDbOrThrow, getNextNumericId, stripMongoId, type FlexDoc } from '@/lib/db/mongo-utils';
import { createErrorResponse, createSuccessResponse, handleApiError } from '@/lib/error-handler';
import { resolveBookableDentistForCalendar } from '@/lib/calendar-dentists';
import { resolveCalendarOwnerScope } from '@/lib/calendar-owner-scope';
import { invalidateReadCaches } from '@/lib/cache-keys';
import { checkWriteRateLimit } from '@/lib/rate-limit';
import {
  assertTenantDentistForCategories,
  canReadCategoriesFor,
  resolveCategoryWriteScope,
} from '@/lib/categories-permissions';
import {
  getAppointmentCategoriesForDentist,
  getUniqueCategoryKey,
} from '@/lib/server/appointment-categories';
import { createAppointmentCategorySchema } from '@/lib/validation';

function parsePositiveInt(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthUser();
    const searchParams = request.nextUrl.searchParams;
    const db = await getMongoDbOrThrow();
    const calendarId = parsePositiveInt(searchParams.get('calendarId'));
    const dentistUserId = parsePositiveInt(searchParams.get('dentistUserId'));

    let targetUserId = auth.userId;
    let targetTenantId = auth.tenantId;

    if (calendarId) {
      const calendar = await db.collection('calendars').findOne(
        { id: calendarId, is_active: true, deleted_at: { $exists: false } },
        { projection: { is_default: 1 } }
      );
      if (!calendar?.is_default) {
        return createSuccessResponse({ categories: [] });
      }

      if (dentistUserId) {
        const dentist = await resolveBookableDentistForCalendar(auth, calendarId, dentistUserId);
        targetUserId = dentist.userId;
        targetTenantId = dentist.tenantId;
      } else {
        const ownerScope = await resolveCalendarOwnerScope(auth, calendarId);
        targetUserId = ownerScope.userId;
        targetTenantId = ownerScope.tenantId;
      }
    } else if (dentistUserId) {
      const dentist = await assertTenantDentistForCategories(auth, dentistUserId);
      if (!canReadCategoriesFor(auth, dentist.userId, dentist.tenantId)) {
        return createErrorResponse('Not authorized to read categories for this dentist', 403);
      }
      targetUserId = dentist.userId;
      targetTenantId = dentist.tenantId;
    }

    const categories = await getAppointmentCategoriesForDentist(targetUserId, targetTenantId);
    return createSuccessResponse({ categories });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch appointment categories');
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthUser();
    const limited = await checkWriteRateLimit(auth.userId);
    if (limited) return limited;

    const body = await request.json();
    const validationResult = createAppointmentCategorySchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validationResult.error.errors },
        { status: 400 }
      );
    }

    const { label, color, dentistUserId } = validationResult.data;
    const targetScope = await resolveCategoryWriteScope(auth, dentistUserId ?? auth.userId);
    const db = await getMongoDbOrThrow();
    const key = await getUniqueCategoryKey(db, targetScope.tenantId, targetScope.userId, label);
    const maxPosition = await db.collection('appointment_categories')
      .find({ tenant_id: targetScope.tenantId, user_id: targetScope.userId })
      .sort({ position: -1 })
      .limit(1)
      .next();

    const now = new Date().toISOString();
    const id = await getNextNumericId('appointment_categories');
    const doc = {
      _id: id,
      id,
      tenant_id: targetScope.tenantId,
      user_id: targetScope.userId,
      key,
      label,
      color,
      position: typeof maxPosition?.position === 'number' ? maxPosition.position + 1 : 0,
      created_at: now,
      updated_at: now,
    };

    await db.collection<FlexDoc>('appointment_categories').insertOne(doc);
    await invalidateReadCaches({
      tenantId: auth.tenantId,
      userId: auth.userId,
      additionalScopes: targetScope.userId !== auth.userId
        ? [{ tenantId: targetScope.tenantId, userId: targetScope.userId }]
        : undefined,
    });

    return createSuccessResponse({ category: stripMongoId(doc) }, 201);
  } catch (error) {
    return handleApiError(error, 'Failed to create appointment category');
  }
}
