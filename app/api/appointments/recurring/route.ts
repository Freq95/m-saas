import { NextRequest, NextResponse } from 'next/server';
import { getMongoDbOrThrow, getNextNumericId } from '@/lib/db/mongo-utils';
import { buildAppointmentDentistFields, resolveAppointmentDentistAssignment } from '@/lib/appointment-service';
import { checkAppointmentConflict } from '@/lib/calendar-conflicts';
import {
  formatAppointmentConflictPayload,
  formatAppointmentConflictSuggestions,
  hasAvailabilityBlockConflict,
} from '@/lib/appointment-conflict-response';
import {
  getCalendarAuth,
  getOrCreateDefaultCalendar,
  requireCalendarPermission,
} from '@/lib/calendar-auth';
import type { RecurrenceRule } from '@/lib/types/calendar';
import { getAuthUser } from '@/lib/auth-helpers';
import { invalidateReadCaches } from '@/lib/cache-keys';
import { logger } from '@/lib/logger';
import { generateRecurringInstances } from '@/lib/recurring-utils';
import { checkWriteRateLimit } from '@/lib/rate-limit';
import { createRecurringAppointmentSchema } from '@/lib/validation';
import { updateClientStats } from '@/lib/client-matching';
import { ExplicitClientSelectionError, resolveAppointmentClientLink } from '../client-linking';
import {
  getAppointmentCategoriesForDentist,
  resolveAppointmentCategoryForWrite,
} from '@/lib/server/appointment-categories';
import { attachCalendarDisplayData } from '@/lib/server/calendar';

interface RecurringConflict {
  start: Date;
  end: Date;
  conflicts: unknown[];
}

// Cleanup classification: feature-flagged (advanced scheduling domain, no core UI dependency).
// POST /api/appointments/recurring - Create recurring appointments
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthUser();
    const { userId, tenantId, dbUserId } = auth;
    const limited = await checkWriteRateLimit(userId);
    if (limited) return limited;
    const body = await request.json();
    const validationResult = createRecurringAppointmentSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validationResult.error.errors },
        { status: 400 }
      );
    }
    const {
      calendarId,
      dentistUserId,
      serviceId,
      serviceIds: serviceIdsInput,
      clientId,
      clientName,
      clientEmail,
      clientPhone,
      startTime,
      endTime,
      notes,
      category,
      categoryId,
      color,
      recurrence,
      forceNewClient,
    } = validationResult.data;

    const db = await getMongoDbOrThrow();
    // Normalize legacy single-service input. The Zod refine() guaranteed at
    // least one of {serviceId, serviceIds} is present.
    const normalizedServiceIds: number[] =
      Array.isArray(serviceIdsInput) && serviceIdsInput.length > 0
        ? Array.from(new Set(serviceIdsInput))
        : typeof serviceId === 'number'
          ? [serviceId]
          : [];

    let appointmentUserId: number;
    let appointmentTenantId = tenantId;
    let targetCalendarId: number;
    let createdByUserId = dbUserId;
    let isSharedCalendar = false;

    if (typeof calendarId === 'number') {
      const calendarAuth = await getCalendarAuth(auth, calendarId);
      requireCalendarPermission(calendarAuth, 'can_create');
      appointmentUserId = calendarAuth.calendarOwnerId;
      appointmentTenantId = calendarAuth.calendarTenantId;
      targetCalendarId = calendarAuth.calendarId;
      isSharedCalendar = !calendarAuth.isOwner;
    } else {
      const defaultCalendar = await getOrCreateDefaultCalendar(auth);
      appointmentUserId = userId;
      targetCalendarId = defaultCalendar.id;
    }

    const dentistAssignment = await resolveAppointmentDentistAssignment(auth, targetCalendarId, dentistUserId);

    if (normalizedServiceIds.length === 0 || normalizedServiceIds.some((id) => !Number.isFinite(id))) {
      return NextResponse.json({ error: 'Invalid numeric fields' }, { status: 400 });
    }

    // Only the dentist themselves can create new patients in their own account.
    if (!dentistAssignment.isCurrentUser && (typeof clientId !== 'number' || forceNewClient)) {
      return NextResponse.json(
        { error: 'Selecteaza un pacient existent. Pacientii pot fi adaugati doar de medicul selectat.' },
        { status: 403 }
      );
    }

    const client = await resolveAppointmentClientLink({
      db,
      userId: dentistAssignment.assignedDentistUserId,
      tenantId: dentistAssignment.assignedDentistTenantId,
      clientId,
      name: clientName,
      email: clientEmail || null,
      phone: clientPhone || null,
      forceNewClient,
    });

    const recurrenceRule: RecurrenceRule = {
      frequency: recurrence.frequency,
      interval: Math.max(1, Number(recurrence.interval) || 1),
      end_date: recurrence.endDate,
      count: recurrence.count,
    };

    const startDateObj = new Date(startTime);
    const endDateObj = new Date(endTime);
    if (Number.isNaN(startDateObj.getTime()) || Number.isNaN(endDateObj.getTime()) || startDateObj >= endDateObj) {
      return NextResponse.json({ error: 'Invalid appointment time range' }, { status: 400 });
    }

    // Generate recurrence group ID atomically to avoid collisions under concurrent requests
    const recurrenceGroupId = await getNextNumericId('recurrence_groups');

    // Generate all recurring instances
    const instances = generateRecurringInstances(
      new Date(startTime),
      new Date(endTime),
      recurrenceRule
    );

    // Add the first instance to the array
    instances.unshift({
      start: new Date(startTime),
      end: new Date(endTime),
    });

    const createdAppointments: Record<string, unknown>[] = [];
    const conflicts: RecurringConflict[] = [];

    // Get service details — services belong to the assigned dentist's catalog.
    // Multi-service: every id must resolve in the same catalog; user-selected
    // order is preserved via the orderedServices array below.
    const serviceDocs = await db.collection('services').find({
      id: { $in: normalizedServiceIds },
      user_id: dentistAssignment.assignedDentistUserId,
      tenant_id: dentistAssignment.assignedDentistTenantId,
      deleted_at: { $exists: false },
    }).toArray();
    if (serviceDocs.length !== normalizedServiceIds.length) {
      return NextResponse.json(
        { error: 'Selected service was not found for the chosen dentist' },
        { status: 400 }
      );
    }
    const serviceById = new Map<number, any>(serviceDocs.map((s: any) => [s.id, s]));
    const orderedServices = normalizedServiceIds.map((id) => serviceById.get(id)).filter(Boolean) as any[];
    const pricesAtTime = orderedServices.map((s: any) =>
      typeof s.price === 'number' ? s.price : 0
    );
    const totalPriceAtTime = pricesAtTime.reduce((sum: number, p: number) => sum + p, 0);
    const serviceNamesSnapshot = orderedServices.map((s: any) => s.name as string);
    // Primary service for the legacy singular fields.
    const service = orderedServices[0];
    const serviceName = service.name;

    const calendarDoc = await db.collection('calendars').findOne(
      { id: targetCalendarId, tenant_id: appointmentTenantId },
      { projection: { is_default: 1 } }
    );
    const isDefaultPersonalCalendar = Boolean(calendarDoc?.is_default && !isSharedCalendar);
    const effectiveCategoryId =
      typeof categoryId === 'number'
        ? categoryId
        : !category && isDefaultPersonalCalendar
          ? (await getAppointmentCategoriesForDentist(
              dentistAssignment.assignedDentistUserId,
              dentistAssignment.assignedDentistTenantId
            ))[0]?.id
          : undefined;

    let resolvedCategory: Awaited<ReturnType<typeof resolveAppointmentCategoryForWrite>> = null;
    if (typeof effectiveCategoryId === 'number') {
      resolvedCategory = await resolveAppointmentCategoryForWrite({
        db,
        tenantId: dentistAssignment.assignedDentistTenantId,
        userId: dentistAssignment.assignedDentistUserId,
        categoryId: effectiveCategoryId,
      });
      if (!resolvedCategory) {
        return NextResponse.json(
          { error: 'Selected category was not found for the chosen dentist' },
          { status: 400 }
        );
      }
    }

    for (const instance of instances) {
      const conflictCheck = await checkAppointmentConflict(
        appointmentUserId,
        appointmentTenantId,
        instance.start,
        instance.end,
        undefined,
        true,
        {
          calendarId: targetCalendarId,
          dentistUserId: dentistAssignment.assignedDentistUserId,
          dentistTenantId: dentistAssignment.assignedDentistTenantId,
        }
      );

      if (hasAvailabilityBlockConflict(conflictCheck.conflicts)) {
        return NextResponse.json(
          {
            error: 'Una sau mai multe programari recurente cad peste un blocaj de disponibilitate.',
            conflicts: conflictCheck.conflicts.map(formatAppointmentConflictPayload),
            suggestions: formatAppointmentConflictSuggestions(conflictCheck.suggestions),
          },
          { status: 409 }
        );
      }
    }

    // Create each instance
    for (const instance of instances) {
      const conflictCheck = await checkAppointmentConflict(
        appointmentUserId,
        appointmentTenantId,
        instance.start,
        instance.end,
        undefined,
        true,
        {
          calendarId: targetCalendarId,
          dentistUserId: dentistAssignment.assignedDentistUserId,
          dentistTenantId: dentistAssignment.assignedDentistTenantId,
        }
      );

      if (hasAvailabilityBlockConflict(conflictCheck.conflicts)) {
        return NextResponse.json(
          {
            error: 'Una sau mai multe programari recurente cad peste un blocaj de disponibilitate.',
            conflicts: conflictCheck.conflicts.map(formatAppointmentConflictPayload),
            suggestions: formatAppointmentConflictSuggestions(conflictCheck.suggestions),
          },
          { status: 409 }
        );
      }

      if (conflictCheck.hasConflict) {
        conflicts.push({
          start: instance.start,
          end: instance.end,
          conflicts: conflictCheck.conflicts,
        });
      }

      const nextId = await getNextNumericId('appointments');

      const appointment: Record<string, unknown> = {
        id: nextId,
        _id: nextId,
        tenant_id: appointmentTenantId,
        user_id: appointmentUserId,
        calendar_id: targetCalendarId,
        created_by_user_id: createdByUserId,
        ...buildAppointmentDentistFields(dentistAssignment),
        // Multi-service fields (new source of truth)
        service_ids: normalizedServiceIds,
        service_names_snapshot: serviceNamesSnapshot,
        prices_at_time: pricesAtTime,
        // Legacy singular fields kept for back-compat with old read paths.
        service_id: normalizedServiceIds[0],
        service_name: serviceName,
        client_id: client.id,
        client_name: client.name || clientName,
        client_email: client.email || clientEmail || null,
        client_phone: client.phone || clientPhone || null,
        start_time: instance.start.toISOString(),
        end_time: instance.end.toISOString(),
        status: 'scheduled',
        recurrence: recurrenceRule,
        recurrence_group_id: recurrenceGroupId,
        reminder_sent: false,
        price_at_time: totalPriceAtTime > 0 ? totalPriceAtTime : null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (notes) appointment.notes = notes;
      if (isDefaultPersonalCalendar && resolvedCategory) {
        appointment.category = resolvedCategory.key;
        appointment.category_label = resolvedCategory.label;
        appointment.category_color = resolvedCategory.color;
      } else if (isDefaultPersonalCalendar && category !== undefined) {
        appointment.category = category || null;
      }
      if (color !== undefined) appointment.color = color || null;

      await db.collection('appointments').insertOne(appointment);

      createdAppointments.push({
        ...appointment,
        created_by_user_id: createdByUserId ? createdByUserId.toString() : null,
        dentist_db_user_id: dentistAssignment.dentistDbUserId.toString(),
      });
    }

    if (createdAppointments.length > 0) {
      await updateClientStats(client.id, dentistAssignment.assignedDentistTenantId);
    }

    await invalidateReadCaches({
      tenantId: appointmentTenantId,
      userId: appointmentUserId,
      calendarId: targetCalendarId,
    });

    const decoratedAppointments = await attachCalendarDisplayData(createdAppointments as any[], userId);

    return NextResponse.json(
      {
        created: createdAppointments.length,
        created_count: createdAppointments.length,
        skipped: 0,
        appointments: decoratedAppointments,
        conflicts: conflicts.length > 0 ? conflicts : undefined,
        warning: conflicts.length > 0
          ? 'Programarile au fost salvate, dar unele intervale se suprapun cu alte programari.'
          : null,
        recurrence_group_id: recurrenceGroupId,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof ExplicitClientSelectionError) {
      return NextResponse.json(
        { error: error.message },
        { status: 409 }
      );
    }
    logger.error(
      'Recurring appointments: failed to create appointments',
      error instanceof Error ? error : new Error(String(error))
    );
    return NextResponse.json(
      { error: 'Failed to create recurring appointments' },
      { status: 500 }
    );
  }
}
