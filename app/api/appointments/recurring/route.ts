import { NextRequest, NextResponse } from 'next/server';
import { getMongoDbOrThrow, getNextNumericId } from '@/lib/db/mongo-utils';
import { AppointmentWriteBusyError, withAppointmentWriteLocks } from '@/lib/appointment-write-lock';
import { buildAppointmentDentistFields, resolveAppointmentDentistAssignment } from '@/lib/appointment-service';
import { checkAppointmentConflict } from '@/lib/calendar-conflicts';
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
import { getTenantTimeZone } from '@/lib/timezone';
import { ExplicitClientSelectionError, resolveAppointmentClientLink } from '../client-linking';

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
    const { createRecurringAppointmentSchema } = await import('@/lib/validation');
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
      clientId,
      clientName,
      clientEmail,
      clientPhone,
      startTime,
      endTime,
      notes,
      category,
      color,
      recurrence,
      forceNewClient,
    } = validationResult.data;

    const db = await getMongoDbOrThrow();
    const normalizedServiceId = Number(serviceId);

    let appointmentUserId: number;
    let appointmentTenantId = tenantId;
    let targetCalendarId: number;
    let createdByUserId = dbUserId;

    if (typeof calendarId === 'number') {
      const calendarAuth = await getCalendarAuth(auth, calendarId);
      requireCalendarPermission(calendarAuth, 'can_create');
      appointmentUserId = calendarAuth.calendarOwnerId;
      appointmentTenantId = calendarAuth.calendarTenantId;
      targetCalendarId = calendarAuth.calendarId;
    } else {
      const defaultCalendar = await getOrCreateDefaultCalendar(auth);
      appointmentUserId = userId;
      targetCalendarId = defaultCalendar.id;
    }

    const dentistAssignment = await resolveAppointmentDentistAssignment(auth, targetCalendarId, dentistUserId);

    if (Number.isNaN(normalizedServiceId)) {
      return NextResponse.json({ error: 'Invalid numeric fields' }, { status: 400 });
    }

    const { updateClientStats } = await import('@/lib/client-matching');
    const client = await resolveAppointmentClientLink({
      db,
      userId: appointmentUserId,
      tenantId: appointmentTenantId,
      clientId,
      name: clientName,
      email: clientEmail || null,
      phone: clientPhone || null,
      forceNewClient,
    });

    const recurrenceRule: RecurrenceRule = {
      frequency: recurrence.frequency,
      interval: Math.max(1, Number(recurrence.interval) || 1),
      end_date: recurrence.end_date || recurrence.endDate,
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
    const tenantTimeZone = await getTenantTimeZone(appointmentTenantId);

    // Get service details
    const service = await db.collection('services').findOne({
      id: normalizedServiceId,
      user_id: dentistAssignment.serviceOwnerUserId,
      tenant_id: dentistAssignment.serviceOwnerTenantId,
      deleted_at: { $exists: false },
    });
    if (!service) {
      return NextResponse.json(
        { error: 'Selected service was not found for the chosen dentist' },
        { status: 400 }
      );
    }
    const serviceName = service.name;

    // Create each instance
    for (const instance of instances) {
      const creationResult = await withAppointmentWriteLocks(
        {
          tenantId: appointmentTenantId,
          userId: appointmentUserId,
          calendarId: targetCalendarId,
          startTime: instance.start,
          endTime: instance.end,
          timeZone: tenantTimeZone,
        },
        async () => {
          const conflictCheck = await checkAppointmentConflict(
            appointmentUserId,
            appointmentTenantId,
            instance.start,
            instance.end,
            undefined,
            true,
            {
              calendarId: targetCalendarId,
              timeZone: tenantTimeZone,
            }
          );

          if (conflictCheck.hasConflict) {
            return { conflictCheck };
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
            service_id: normalizedServiceId,
            service_name: serviceName,
            client_id: client.id,
            client_name: clientName,
            client_email: clientEmail || null,
            client_phone: clientPhone || null,
            start_time: instance.start.toISOString(),
            end_time: instance.end.toISOString(),
            status: 'scheduled',
            recurrence: recurrenceRule,
            recurrence_group_id: recurrenceGroupId,
            reminder_sent: false,
            price_at_time: typeof service.price === 'number' ? service.price : null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          if (notes) appointment.notes = notes;
          if (category !== undefined) appointment.category = category || null;
          if (color !== undefined) appointment.color = color || null;

          await db.collection('appointments').insertOne(appointment);
          return { appointment };
        }
      );

      if ('conflictCheck' in creationResult) {
        const conflictCheck = creationResult.conflictCheck;
        conflicts.push({
          start: instance.start,
          end: instance.end,
          conflicts: conflictCheck ? conflictCheck.conflicts : [],
        });
        continue;
      }

      createdAppointments.push({
        ...creationResult.appointment,
        created_by_user_id: createdByUserId ? createdByUserId.toString() : null,
        dentist_db_user_id: dentistAssignment.dentistDbUserId.toString(),
      });
    }

    if (createdAppointments.length > 0) {
      await updateClientStats(client.id, appointmentTenantId);
    }

    await invalidateReadCaches({
      tenantId: appointmentTenantId,
      userId: appointmentUserId,
      calendarId: targetCalendarId,
    });

    return NextResponse.json(
      {
        created: createdAppointments.length,
        created_count: createdAppointments.length,
        skipped: conflicts.length,
        appointments: createdAppointments,
        conflicts: conflicts.length > 0 ? conflicts : undefined,
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
    if (error instanceof AppointmentWriteBusyError) {
      return NextResponse.json(
        { error: 'Another booking is being created for this slot. Please try again.' },
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
