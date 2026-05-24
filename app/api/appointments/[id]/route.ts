import { NextRequest, NextResponse } from 'next/server';
import { getMongoDbOrThrow, getNextNumericId, stripMongoId, type FlexDoc } from '@/lib/db/mongo-utils';
import { updateClientStats } from '@/lib/client-matching';
import { canDeleteAppointment, canEditAppointment, getCalendarAuth } from '@/lib/calendar-auth';
import { handleApiError, createSuccessResponse, createErrorResponse } from '@/lib/error-handler';
import { checkAppointmentConflict } from '@/lib/calendar-conflicts';
import {
  formatAppointmentConflictPayload,
  formatAppointmentConflictSuggestions,
  getAppointmentConflictWarning,
  hasAvailabilityBlockConflict,
} from '@/lib/appointment-conflict-response';
import { getAuthUser, type AuthContext } from '@/lib/auth-helpers';
import {
  buildAppointmentDentistFields,
  getServiceOwnerScopeFromAppointment,
  resolveAppointmentDentistAssignment,
} from '@/lib/appointment-service';
import { invalidateReadCaches } from '@/lib/cache-keys';
import { logger } from '@/lib/logger';
import { resolveAppointmentCategoryForWrite } from '@/lib/server/appointment-categories';
import { checkUpdateRateLimit } from '@/lib/rate-limit';
import { generateRecurringInstances } from '@/lib/recurring-utils';
import { attachCalendarDisplayData, projectMultiServiceFields } from '@/lib/server/calendar';
import { updateAppointmentSchema } from '@/lib/validation';
import { ExplicitClientSelectionError, resolveAppointmentClientLink } from '../client-linking';

function matchesLegacyAppointmentOwner(
  appointment: Record<string, any>,
  auth: Pick<AuthContext, 'userId' | 'tenantId'>
): boolean {
  return appointment.user_id === auth.userId && appointment.tenant_id?.toString() === auth.tenantId.toString();
}

function appointmentMutationFilter(
  appointmentId: number,
  appointment: Record<string, any>
) {
  return typeof appointment.calendar_id === 'number'
    ? { id: appointmentId, deleted_at: { $exists: false } }
    : {
        id: appointmentId,
        user_id: appointment.user_id,
        tenant_id: appointment.tenant_id,
        deleted_at: { $exists: false },
      };
}

const activeClientFilter = {
  $or: [
    { deleted_at: { $exists: false } },
    { deleted_at: null },
  ],
};

async function loadAppointmentClient(
  db: Awaited<ReturnType<typeof getMongoDbOrThrow>>,
  appointment: Record<string, any>,
  serviceOwnerScope: ReturnType<typeof getServiceOwnerScopeFromAppointment>
) {
  if (!appointment.client_id) return null;

  const filters: Array<Record<string, unknown>> = [];
  if (serviceOwnerScope) {
    filters.push({
      id: appointment.client_id,
      tenant_id: serviceOwnerScope.serviceOwnerTenantId,
      user_id: serviceOwnerScope.serviceOwnerUserId,
      ...activeClientFilter,
    });
    filters.push({
      id: appointment.client_id,
      tenant_id: serviceOwnerScope.serviceOwnerTenantId,
      ...activeClientFilter,
    });
  }
  filters.push({
    id: appointment.client_id,
    tenant_id: appointment.tenant_id,
    ...activeClientFilter,
  });

  const seen = new Set<string>();
  for (const filter of filters) {
    const key = JSON.stringify(filter, (_k, value) =>
      value && typeof value === 'object' && typeof value.toString === 'function'
        ? value.toString()
        : value
    );
    if (seen.has(key)) continue;
    seen.add(key);
    const client = await db.collection('clients').findOne(filter);
    if (client) return client;
  }

  return null;
}

// GET /api/appointments/[id] - Get single appointment
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const auth = await getAuthUser();
    const db = await getMongoDbOrThrow();
    const appointmentId = Number(params.id);

    if (Number.isNaN(appointmentId)) {
      return createErrorResponse('Invalid appointment ID', 400);
    }

    const appointmentDoc = await db.collection('appointments').findOne({
      id: appointmentId,
      deleted_at: { $exists: false },
    });
    if (!appointmentDoc) {
      return createErrorResponse('Appointment not found', 404);
    }

    if (typeof appointmentDoc.calendar_id === 'number') {
      await getCalendarAuth(auth, appointmentDoc.calendar_id);
    } else if (!matchesLegacyAppointmentOwner(appointmentDoc, auth)) {
      return createErrorResponse('Appointment not found', 404);
    }

    const serviceOwnerScope = getServiceOwnerScopeFromAppointment(appointmentDoc);
    const [clientDoc, serviceDoc] = await Promise.all([
      loadAppointmentClient(db, appointmentDoc, serviceOwnerScope),
      appointmentDoc.service_id && serviceOwnerScope
        ? db.collection('services').findOne({
            id: appointmentDoc.service_id,
            tenant_id: serviceOwnerScope.serviceOwnerTenantId,
            user_id: serviceOwnerScope.serviceOwnerUserId,
          })
        : null,
    ]);

    const appointment = {
      ...stripMongoId(appointmentDoc),
      client_name: clientDoc?.name || appointmentDoc.client_name,
      client_email: clientDoc?.email || appointmentDoc.client_email,
      client_phone: clientDoc?.phone || appointmentDoc.client_phone,
      service_name: serviceDoc?.name || (appointmentDoc.service_name as string | null) || null,
    };
    const [decoratedAppointment] = await attachCalendarDisplayData([appointment], auth.userId);
    const finalAppointment = decoratedAppointment
      ? projectMultiServiceFields(decoratedAppointment)
      : projectMultiServiceFields(appointment);

    return createSuccessResponse({ appointment: finalAppointment });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch appointment');
  }
}

// PATCH /api/appointments/[id] - Update appointment
export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const auth = await getAuthUser();
    const { userId, tenantId, dbUserId } = auth;
    const limited = await checkUpdateRateLimit(userId);
    if (limited) return limited;
    const db = await getMongoDbOrThrow();
    const appointmentId = Number(params.id);
    const body = await request.json();

    if (Number.isNaN(appointmentId)) {
      return createErrorResponse('Invalid appointment ID', 400);
    }

    const validationResult = updateAppointmentSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validationResult.error.errors },
        { status: 400 }
      );
    }

    const {
      status,
      startTime,
      endTime,
      notes,
      dentistUserId,
      serviceId,
      serviceIds: serviceIdsInput,
      clientId,
      clientName,
      clientEmail,
      clientPhone,
      forceNewClient,
      category,
      categoryId,
      color,
      isRecurring: isRecurringInput,
      recurrence: recurrenceInput,
      scope: scopeInput,
    } = validationResult.data;

    // Normalize multi-service input. If neither serviceIds nor serviceId is
    // supplied, keep current values (no service change requested). When the
    // legacy singular `serviceId` is supplied alone, wrap it in a 1-element
    // array so all downstream code sees the same shape.
    const serviceIdsForUpdate: number[] | undefined =
      Array.isArray(serviceIdsInput) && serviceIdsInput.length > 0
        ? Array.from(new Set(serviceIdsInput))
        : typeof serviceId === 'number'
          ? [serviceId]
          : undefined;

    // Default scope is 'this' (only this occurrence). 'series' is opt-in.
    const scope: 'this' | 'series' = scopeInput === 'series' ? 'series' : 'this';

    // Get existing appointment
    const existingAppointment = await db.collection('appointments').findOne({
      id: appointmentId,
      deleted_at: { $exists: false },
    });
    if (!existingAppointment) {
      return createErrorResponse('Appointment not found', 404);
    }

    // Defense against an old client that still ships `isRecurring + recurrence`
    // in PATCH bodies for existing recurring instances. With those fields
    // present the request looks like "regenerate the series from this anchor"
    // — which on scope='this' clobbers siblings + spawns a ghost tail
    // occurrence, and on scope='series' DELETES the existing siblings and
    // replaces them with brand-new occurrences inheriting the anchor's time
    // (so the whole schedule shifts and IDs change). Neither is ever what
    // the user wants when editing an existing instance — the recurrence rule
    // itself isn't meant to be reshaped here. Strip in both scopes; if the
    // user really needs to reshape the series, they can delete and recreate.
    const isExistingRecurringInstance = Boolean(existingAppointment.recurrence_group_id);
    const isRecurring = isExistingRecurringInstance ? undefined : isRecurringInput;
    const recurrence = isExistingRecurringInstance ? undefined : recurrenceInput;

    let isSharedCalendar = false;
    if (typeof existingAppointment.calendar_id === 'number') {
      const calendarAuth = await getCalendarAuth(auth, existingAppointment.calendar_id);
      if (!canEditAppointment(calendarAuth, existingAppointment as any, dbUserId)) {
        return createErrorResponse('Not authorized to edit this appointment', 403);
      }
      isSharedCalendar = !calendarAuth.isOwner;
    } else if (!matchesLegacyAppointmentOwner(existingAppointment, auth)) {
      return createErrorResponse('Not found or not authorized', 404);
    }

    const appointmentTenantId = existingAppointment.tenant_id;
    const appointmentUserId = existingAppointment.user_id;
    const appointmentCalendarId = typeof existingAppointment.calendar_id === 'number'
      ? existingAppointment.calendar_id
      : undefined;
    const appointmentCalendar = appointmentCalendarId
      ? await db.collection('calendars').findOne(
          { id: appointmentCalendarId, tenant_id: appointmentTenantId },
          { projection: { is_default: 1 } }
        )
      : null;
    const canUseAppointmentCategories = Boolean(appointmentCalendar?.is_default && !isSharedCalendar);

    // Determine if the appointment's assigned dentist is the current user.
    // For new appointments dentist_id is always set; for legacy ones fall back to isSharedCalendar.
    const appointmentDentistId = typeof existingAppointment.dentist_id === 'number'
      ? existingAppointment.dentist_id
      : null;
    const isDentistCurrentUser = appointmentDentistId !== null
      ? appointmentDentistId === userId
      : !isSharedCalendar;
    const mutationFilter = appointmentMutationFilter(appointmentId, existingAppointment);

    const updates: Record<string, unknown> = {};
    // Captured when the caller changes serviceIds — used by the scope='series'
    // fan-out below to recompute each sibling's end_time from its own start.
    let newTotalDurationMin = 0;
    const shouldCreateRecurringInstances =
      isRecurring === true &&
      recurrence !== undefined &&
      !existingAppointment.recurrence_group_id;

    if (status !== undefined) {
      updates.status = status;
    }

    const WARN_TRANSITIONS: Record<string, string[]> = {
      cancelled: ['completed'],
      'no-show': ['completed'],
    };
    const STATUS_LABELS: Record<string, string> = {
      scheduled: 'Programat',
      completed: 'Finalizat',
      cancelled: 'Anulat',
      'no-show': 'Absent',
    };
    const currentStatus = existingAppointment.status === 'no_show'
      ? 'no-show'
      : String(existingAppointment.status || 'scheduled');
    const warning = status && WARN_TRANSITIONS[currentStatus]?.includes(status)
      ? `Statusul a fost schimbat din "${STATUS_LABELS[currentStatus] ?? currentStatus}" în "${STATUS_LABELS[status] ?? status}".`
      : null;

    const hasTimeOrAllocationChange =
      startTime !== undefined ||
      endTime !== undefined;

    // Compute effective new times up-front so we can warn about overlaps without blocking the update.
    let newStartTime: Date | null = null;
    let newEndTime: Date | null = null;
    if (hasTimeOrAllocationChange) {
      newStartTime = startTime
        ? (typeof startTime === 'string' ? new Date(startTime) : startTime)
        : new Date(existingAppointment.start_time);
      newEndTime = endTime
        ? (typeof endTime === 'string' ? new Date(endTime) : endTime)
        : new Date(existingAppointment.end_time);

      if (
        Number.isNaN(newStartTime.getTime()) ||
        Number.isNaN(newEndTime.getTime()) ||
        newStartTime >= newEndTime
      ) {
        return createErrorResponse('Invalid appointment time range', 400);
      }

      if (startTime) {
        updates.start_time = newStartTime.toISOString();
      }
      if (endTime) {
        updates.end_time = newEndTime.toISOString();
      }
    }

    if (notes !== undefined) {
      updates.notes = notes;
    }

    const serviceOwnerScope = getServiceOwnerScopeFromAppointment(existingAppointment);
    let effectiveServiceOwnerScope = serviceOwnerScope;
    let effectiveDentistIsCurrentUser = isDentistCurrentUser;

    let dentistScopeChanged = false;
    if (dentistUserId !== undefined) {
      if (!appointmentCalendarId) {
        return createErrorResponse('Assigned dentist can only be changed for calendar appointments', 400);
      }
      if (!serviceOwnerScope) {
        return createErrorResponse('Appointment owner context is missing for this appointment', 400);
      }
      const dentistAssignment = await resolveAppointmentDentistAssignment(
        auth,
        appointmentCalendarId,
        dentistUserId
      );
      effectiveServiceOwnerScope = {
        serviceOwnerUserId: dentistAssignment.assignedDentistUserId,
        serviceOwnerTenantId: dentistAssignment.assignedDentistTenantId,
      };
      dentistScopeChanged =
        serviceOwnerScope.serviceOwnerUserId !== effectiveServiceOwnerScope.serviceOwnerUserId ||
        serviceOwnerScope.serviceOwnerTenantId.toString() !== effectiveServiceOwnerScope.serviceOwnerTenantId.toString();
      effectiveDentistIsCurrentUser = dentistAssignment.isCurrentUser;
      Object.assign(
        updates,
        buildAppointmentDentistFields(dentistAssignment)
      );
    }

    if (serviceIdsForUpdate !== undefined) {
      if (!effectiveServiceOwnerScope) {
        return createErrorResponse('Assigned dentist context is missing for this appointment', 400);
      }
      const serviceDocs = await db.collection('services').find({
        id: { $in: serviceIdsForUpdate },
        user_id: effectiveServiceOwnerScope.serviceOwnerUserId,
        tenant_id: effectiveServiceOwnerScope.serviceOwnerTenantId,
        deleted_at: { $exists: false },
      }).toArray();
      if (serviceDocs.length !== serviceIdsForUpdate.length) {
        return createErrorResponse('Selected service was not found for the assigned dentist', 400);
      }
      const serviceById = new Map<number, any>(serviceDocs.map((s: any) => [s.id, s]));
      const orderedServices = serviceIdsForUpdate.map((id) => serviceById.get(id)).filter(Boolean) as any[];
      const pricesAtTime = orderedServices.map((s: any) =>
        typeof s.price === 'number' ? s.price : 0
      );
      const totalPrice = pricesAtTime.reduce((sum: number, p: number) => sum + p, 0);
      const totalDurationMin = orderedServices.reduce(
        (sum: number, s: any) => sum + (typeof s.duration_minutes === 'number' ? s.duration_minutes : 0),
        0
      );
      const serviceNamesSnapshot = orderedServices.map((s: any) => s.name as string);
      // Write all four shapes — both new (arrays) and legacy (singular).
      updates.service_ids = serviceIdsForUpdate;
      updates.service_names_snapshot = serviceNamesSnapshot;
      updates.prices_at_time = pricesAtTime;
      updates.service_id = serviceIdsForUpdate[0];
      updates.service_name = serviceNamesSnapshot[0] || null;
      updates.price_at_time = totalPrice > 0 ? totalPrice : null;

      // Re-derive end_time from start + new total duration when the caller
      // didn't supply endTime explicitly. Without this a service change that
      // shifts duration (e.g. 30min → 60min) leaves the card visually 30min
      // wide on the calendar even though the patient is booked for 60min.
      // The UI form sends endTime in the same patch so this is mostly a
      // safety net for direct API consumers and the series fan-out below.
      if (totalDurationMin > 0 && endTime === undefined) {
        const baseStart = startTime
          ? (typeof startTime === 'string' ? new Date(startTime) : startTime)
          : new Date(existingAppointment.start_time);
        if (!Number.isNaN(baseStart.getTime())) {
          updates.end_time = new Date(baseStart.getTime() + totalDurationMin * 60_000).toISOString();
        }
      }
      // Captured for the series fan-out further down. Kept on a local
      // variable so we don't leak a synthetic field into the Mongo doc.
      newTotalDurationMin = totalDurationMin;
    }

    const shouldUpdateClient =
      clientName !== undefined || clientEmail !== undefined || clientPhone !== undefined;

    if (shouldUpdateClient) {
      const normalizedName = (clientName ?? existingAppointment.client_name ?? '').trim();
      if (!normalizedName) {
        return createErrorResponse('Client name is required', 400);
      }

      // Only the dentist themselves can create new patients in their own account.
      if (!effectiveDentistIsCurrentUser && (typeof clientId !== 'number' || forceNewClient)) {
        return createErrorResponse('Selecteaza un pacient existent. Pacientii pot fi adaugati doar de medicul selectat.', 403);
      }

      const normalizedEmail = clientEmail !== undefined
        ? (clientEmail || null)
        : (existingAppointment.client_email || null);
      const normalizedPhone = clientPhone !== undefined
        ? (clientPhone || null)
        : (existingAppointment.client_phone || null);

      // Clients belong to the dentist's account (serviceOwnerScope reflects the dentist
      // for new appointments, or the calendar owner for legacy appointments).
      const clientUserId = effectiveServiceOwnerScope?.serviceOwnerUserId ?? appointmentUserId;
      const clientTenantId = effectiveServiceOwnerScope?.serviceOwnerTenantId ?? appointmentTenantId;

      const linkedClient = await resolveAppointmentClientLink({
        db,
        userId: clientUserId,
        tenantId: clientTenantId,
        clientId,
        name: normalizedName,
        email: normalizedEmail,
        phone: normalizedPhone,
        forceNewClient: forceNewClient ?? false,
        overwriteContactFields: true,
      });

      updates.client_id = linkedClient.id;
      updates.client_name = normalizedName;
      updates.client_email = normalizedEmail;
      updates.client_phone = normalizedPhone;
    }

    if (canUseAppointmentCategories && categoryId !== undefined) {
      if (categoryId === null) {
        updates.category = null;
        updates.category_label = null;
        updates.category_color = null;
      } else {
        if (!effectiveServiceOwnerScope) {
          return createErrorResponse('Assigned dentist context is missing for this appointment', 400);
        }
        const resolvedCategory = await resolveAppointmentCategoryForWrite({
          db,
          tenantId: effectiveServiceOwnerScope.serviceOwnerTenantId,
          userId: effectiveServiceOwnerScope.serviceOwnerUserId,
          categoryId,
        });
        if (!resolvedCategory) {
          return createErrorResponse('Selected category was not found for the assigned dentist', 400);
        }
        updates.category = resolvedCategory.key;
        updates.category_label = resolvedCategory.label;
        updates.category_color = resolvedCategory.color;
      }
    } else if (canUseAppointmentCategories && category !== undefined) {
      const nextCategory = category || null;
      const currentCategory = existingAppointment.category || null;
      if (nextCategory !== currentCategory) {
        updates.category = nextCategory;
        updates.category_label = null;
        updates.category_color = null;
      }
    }

    if (color !== undefined) {
      updates.color = color || null;
    }

    if (isRecurring === false) {
      updates.recurrence = null;
      updates.recurrence_group_id = null;
    } else if ((isRecurring === true || recurrence) && recurrence) {
      updates.recurrence = {
        frequency: recurrence.frequency,
        interval: Math.max(1, Number(recurrence.interval) || 1),
        end_date: recurrence.endDate,
        count: recurrence.count,
      };
      updates.recurrence_group_id = existingAppointment.recurrence_group_id
        || await getNextNumericId('recurrence_groups');
    }

    if (Object.keys(updates).length === 0) {
      return createErrorResponse('No fields to update', 400);
    }

    updates.updated_at = new Date().toISOString();

    const previousClientId = typeof existingAppointment.client_id === 'number' ? existingAppointment.client_id : null;

    let conflictWarningData: {
      conflicts: unknown[];
      suggestions: Array<{ start: Date; end: Date }>;
    } = {
      conflicts: [],
      suggestions: [],
    };

    type PatchResult =
      | { kind: 'not_found' }
      | { kind: 'availability_conflict'; conflicts: unknown[]; suggestions: Array<{ start: Date; end: Date }> }
      | { kind: 'ok'; doc: any };

    const runMutation = async (): Promise<PatchResult> => {
      if (hasTimeOrAllocationChange && newStartTime && newEndTime) {
        const conflictCheck = await checkAppointmentConflict(
          appointmentUserId,
          appointmentTenantId,
          newStartTime,
          newEndTime,
          appointmentId,
          true,
          {
            calendarId: appointmentCalendarId,
            dentistUserId: effectiveServiceOwnerScope?.serviceOwnerUserId ?? appointmentDentistId ?? appointmentUserId,
            dentistTenantId: effectiveServiceOwnerScope?.serviceOwnerTenantId ?? appointmentTenantId,
          }
        );
        conflictWarningData = {
          conflicts: conflictCheck.conflicts,
          suggestions: conflictCheck.suggestions,
        };
        if (hasAvailabilityBlockConflict(conflictCheck.conflicts)) {
          return { kind: 'availability_conflict', conflicts: conflictCheck.conflicts, suggestions: conflictCheck.suggestions };
        }
      }

      const doc = await db.collection('appointments').findOneAndUpdate(
        mutationFilter,
        { $set: updates },
        { returnDocument: 'after' }
      );
      if (!doc) {
        return { kind: 'not_found' };
      }
      return { kind: 'ok', doc };
    };

    const patchResult: PatchResult = await runMutation();

    if (patchResult.kind === 'availability_conflict') {
      return NextResponse.json(
        {
          error: 'Intervalul este blocat in calendar.',
          conflicts: patchResult.conflicts.map(formatAppointmentConflictPayload),
          suggestions: formatAppointmentConflictSuggestions(patchResult.suggestions),
        },
        { status: 409 }
      );
    }

    if (patchResult.kind === 'not_found') {
      return createErrorResponse('Not found or not authorized', 404);
    }

    const appointmentDoc = patchResult.doc;

    const shouldSyncRecurringSeriesFromAnchor =
      !shouldCreateRecurringInstances &&
      appointmentDoc.recurrence &&
      appointmentDoc.recurrence_group_id &&
      (isRecurring !== undefined || recurrence !== undefined);

    if (
      shouldCreateRecurringInstances &&
      appointmentDoc.recurrence &&
      appointmentDoc.recurrence_group_id
    ) {
      const recurrenceRule = appointmentDoc.recurrence;
      const recurringInstances = generateRecurringInstances(
        new Date(appointmentDoc.start_time),
        new Date(appointmentDoc.end_time),
        recurrenceRule
      );

      for (const instance of recurringInstances) {
        const conflictCheck = await checkAppointmentConflict(
          appointmentDoc.user_id,
          appointmentTenantId,
          instance.start,
          instance.end,
          undefined,
          true,
          {
            calendarId: typeof appointmentDoc.calendar_id === 'number' ? appointmentDoc.calendar_id : undefined,
            dentistUserId: typeof appointmentDoc.service_owner_user_id === 'number'
              ? appointmentDoc.service_owner_user_id
              : typeof appointmentDoc.dentist_id === 'number'
                ? appointmentDoc.dentist_id
                : appointmentDoc.user_id,
            dentistTenantId: getServiceOwnerScopeFromAppointment(appointmentDoc)?.serviceOwnerTenantId ?? appointmentTenantId,
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
          conflictWarningData.conflicts.push(...conflictCheck.conflicts);
          conflictWarningData.suggestions.push(...conflictCheck.suggestions);
        }

        const nextRecurringId = await getNextNumericId('appointments');
        const nowIso = new Date().toISOString();
        await db.collection<FlexDoc>('appointments').insertOne({
          id: nextRecurringId,
          _id: nextRecurringId,
          tenant_id: appointmentTenantId,
          user_id: appointmentDoc.user_id,
          calendar_id: appointmentDoc.calendar_id || null,
          created_by_user_id: appointmentDoc.created_by_user_id || null,
          dentist_db_user_id: appointmentDoc.dentist_db_user_id || null,
          dentist_id: appointmentDoc.dentist_id || null,
          service_owner_user_id: appointmentDoc.service_owner_user_id || appointmentDoc.user_id,
          service_owner_tenant_id: appointmentDoc.service_owner_tenant_id || appointmentTenantId,
          conversation_id: appointmentDoc.conversation_id || null,
          service_id: appointmentDoc.service_id,
          service_name: appointmentDoc.service_name || null,
          client_id: appointmentDoc.client_id || null,
          client_name: appointmentDoc.client_name || null,
          client_email: appointmentDoc.client_email || null,
          client_phone: appointmentDoc.client_phone || null,
          start_time: instance.start.toISOString(),
          end_time: instance.end.toISOString(),
          status: 'scheduled',
          category: appointmentDoc.category || null,
          category_label: appointmentDoc.category_label || null,
          category_color: appointmentDoc.category_color || null,
          color: appointmentDoc.color || null,
          notes: appointmentDoc.notes || null,
          price_at_time: appointmentDoc.price_at_time ?? null,
          recurrence: recurrenceRule,
          recurrence_group_id: appointmentDoc.recurrence_group_id,
          reminder_sent: false,
          created_at: nowIso,
          updated_at: nowIso,
        });
      }
    }

    else if (shouldSyncRecurringSeriesFromAnchor) {
      await syncRecurringSeriesFromAnchor({
        db,
        tenantId: appointmentTenantId,
        anchorAppointment: appointmentDoc,
      });
    }

    const impactedClientScopes = new Map<string, { clientId: number; tenantId: any }>();
    const addImpactedClientScope = (clientId: unknown, tenantId: unknown) => {
      if (typeof clientId !== 'number' || !tenantId) return;
      impactedClientScopes.set(`${String(tenantId)}:${clientId}`, { clientId, tenantId });
    };

    if (previousClientId !== null) {
      addImpactedClientScope(
        previousClientId,
        serviceOwnerScope?.serviceOwnerTenantId ?? appointmentTenantId
      );
    }
    if (typeof appointmentDoc.client_id === 'number') {
      const nextServiceOwnerScope = getServiceOwnerScopeFromAppointment(appointmentDoc);
      addImpactedClientScope(
        appointmentDoc.client_id,
        nextServiceOwnerScope?.serviceOwnerTenantId ?? appointmentTenantId
      );
    }
    if (
      impactedClientScopes.size > 0 &&
      (
        previousClientId !== appointmentDoc.client_id ||
        dentistUserId !== undefined ||
        status !== undefined ||
        serviceId !== undefined ||
        startTime !== undefined ||
        endTime !== undefined ||
        clientName !== undefined ||
        clientEmail !== undefined ||
        clientPhone !== undefined ||
        isRecurring !== undefined ||
        recurrence !== undefined
      )
    ) {
      await Promise.all(
        Array.from(impactedClientScopes.values()).map((scope) =>
          updateClientStats(scope.clientId, scope.tenantId)
        )
      );
    }
    // ── Series-wide fan-out for recurring appointments ────────────────────
    //
    // When the user picked "Intreaga serie" in the scope modal, propagate
    // the non-time updates to every sibling appointment in the same
    // recurrence_group_id. Some fields stay per-instance because they
    // describe an event that happened (or hasn't) at a specific point in
    // time — fanning them out makes the schedule incoherent:
    //   - start_time / end_time / date: applying the anchor's slot to every
    //     occurrence would pile them on a single day
    //   - status: a future occurrence can't be `completed`/`no-show` yet,
    //     and marking it so erases the record of which actually happened
    //   - reminder_sent: tracking is per-occurrence
    //   - recurrence / recurrence_group_id: per-instance metadata
    // We surface a warning when the user tried to change one of these
    // per-instance fields with scope=series so they aren't left wondering
    // why siblings didn't update.
    let seriesFanOutWarning: string | null = null;
    const groupId = existingAppointment.recurrence_group_id;
    if (scope === 'series' && typeof groupId === 'number') {
      const seriesUpdates: Record<string, unknown> = { ...updates };
      delete seriesUpdates.start_time;
      delete seriesUpdates.end_time;
      delete seriesUpdates.status;
      delete seriesUpdates.reminder_sent;
      delete seriesUpdates.recurrence;
      delete seriesUpdates.recurrence_group_id;
      // updated_at stamp stays.

      if (Object.keys(seriesUpdates).length > 0) {
        await db.collection('appointments').updateMany(
          {
            recurrence_group_id: groupId,
            tenant_id: appointmentTenantId,
            deleted_at: { $exists: false },
            // Exclude the anchor we just patched to avoid double-write.
            id: { $ne: appointmentId },
          },
          { $set: seriesUpdates }
        );

        // When services changed, each sibling's end_time is now wrong
        // (still anchored to its old duration). Loop and recompute from
        // each sibling's own start_time + new total duration. A series
        // is capped at 52 occurrences in validation, so this is bounded.
        if (newTotalDurationMin > 0) {
          const siblings = await db.collection('appointments').find(
            {
              recurrence_group_id: groupId,
              tenant_id: appointmentTenantId,
              deleted_at: { $exists: false },
              id: { $ne: appointmentId },
            },
            { projection: { id: 1, start_time: 1 } }
          ).toArray();
          await Promise.all(siblings.map((sib: any) => {
            const sibStart = new Date(sib.start_time);
            if (Number.isNaN(sibStart.getTime())) return Promise.resolve();
            const sibEnd = new Date(sibStart.getTime() + newTotalDurationMin * 60_000);
            return db.collection('appointments').updateOne(
              { id: sib.id },
              { $set: { end_time: sibEnd.toISOString() } }
            );
          }));
        }
      }

      const changedPerInstanceFields: string[] = [];
      if (startTime !== undefined || endTime !== undefined) changedPerInstanceFields.push('data/ora');
      if (status !== undefined) changedPerInstanceFields.push('statusul');
      if (changedPerInstanceFields.length > 0) {
        const list = changedPerInstanceFields.join(' si ');
        seriesFanOutWarning = `Modificarile pentru ${list} s-au aplicat doar acestei aparitii.`;
      }
    }

    await invalidateReadCaches({
      tenantId: appointmentTenantId,
      userId: appointmentUserId,
      calendarId: appointmentCalendarId,
    });
    const conflictWarning = getAppointmentConflictWarning(conflictWarningData.conflicts);
    const responseWarning =
      [warning, conflictWarning, seriesFanOutWarning].filter(Boolean).join(' ') || null;

    const appointment = stripMongoId(appointmentDoc);
    const [decoratedAppointment] = await attachCalendarDisplayData([appointment], userId);
    const finalAppointment = decoratedAppointment
      ? projectMultiServiceFields(decoratedAppointment)
      : projectMultiServiceFields(appointment);

    return createSuccessResponse({
      appointment: finalAppointment,
      warning: responseWarning,
      conflicts: conflictWarningData.conflicts.map(formatAppointmentConflictPayload),
      suggestions: formatAppointmentConflictSuggestions(conflictWarningData.suggestions),
    });
  } catch (error) {
    if (error instanceof ExplicitClientSelectionError) {
      return createErrorResponse(error.message, 409);
    }
    if (error instanceof Error && error.message === 'AVAILABILITY_BLOCK_CONFLICT') {
      return createErrorResponse('Una sau mai multe programari recurente cad peste un blocaj de disponibilitate.', 409);
    }
    return handleApiError(error, 'Failed to update appointment');
  }
}

async function syncRecurringSeriesFromAnchor({
  db,
  tenantId,
  anchorAppointment,
}: {
  db: any;
  tenantId: any;
  anchorAppointment: any;
}): Promise<void> {
  if (!anchorAppointment.recurrence || !anchorAppointment.recurrence_group_id) {
    return;
  }

  const anchorStart = new Date(anchorAppointment.start_time);
  const anchorEnd = new Date(anchorAppointment.end_time);
  if (Number.isNaN(anchorStart.getTime()) || Number.isNaN(anchorEnd.getTime()) || anchorStart >= anchorEnd) {
    logger.error('syncRecurringSeriesFromAnchor: invalid anchor time range, skipping series sync', {
      appointmentId: anchorAppointment.id,
      start_time: anchorAppointment.start_time,
      end_time: anchorAppointment.end_time,
    });
    return;
  }

  const futureInstances = generateRecurringInstances(anchorStart, anchorEnd, anchorAppointment.recurrence);
  const desiredInstances = futureInstances.map((instance) => ({
    start: instance.start,
    end: instance.end,
    key: `${instance.start.toISOString()}|${instance.end.toISOString()}`,
  }));
  const desiredKeys = new Set(desiredInstances.map((item) => item.key));

  const existingSeriesAppointments = await db.collection('appointments').find({
    tenant_id: tenantId,
    user_id: anchorAppointment.user_id,
    recurrence_group_id: anchorAppointment.recurrence_group_id,
    deleted_at: { $exists: false },
    id: { $ne: anchorAppointment.id },
  }).toArray();

  const existingByKey = new Map<string, any>();
  const toDeleteIds: number[] = [];
  const toUpdateIds: number[] = [];
  const toInsertDocs: any[] = [];

  for (const appointment of existingSeriesAppointments) {
    if (appointment.status !== 'scheduled') {
      continue;
    }
    const normalizedStart = new Date(appointment.start_time);
    const normalizedEnd = new Date(appointment.end_time);
    if (Number.isNaN(normalizedStart.getTime()) || Number.isNaN(normalizedEnd.getTime())) {
      logger.warn('syncRecurringSeriesFromAnchor: invalid recurring instance date, skipping key matching', {
        appointmentId: appointment.id,
        recurrenceGroupId: anchorAppointment.recurrence_group_id,
        start_time: appointment.start_time,
        end_time: appointment.end_time,
      });
      continue;
    }
    if (normalizedStart < anchorStart) {
      continue;
    }
    const key = `${normalizedStart.toISOString()}|${normalizedEnd.toISOString()}`;
    if (desiredKeys.has(key)) {
      existingByKey.set(key, appointment);
      toUpdateIds.push(appointment.id);
    } else {
      toDeleteIds.push(appointment.id);
    }
  }

  for (const desired of desiredInstances) {
    if (existingByKey.has(desired.key)) {
      continue;
    }

    const conflictCheck = await checkAppointmentConflict(
      anchorAppointment.user_id,
      tenantId,
      desired.start,
      desired.end,
      undefined,
      true,
      {
        calendarId: typeof anchorAppointment.calendar_id === 'number' ? anchorAppointment.calendar_id : undefined,
        dentistUserId: typeof anchorAppointment.service_owner_user_id === 'number'
          ? anchorAppointment.service_owner_user_id
          : typeof anchorAppointment.dentist_id === 'number'
            ? anchorAppointment.dentist_id
            : anchorAppointment.user_id,
        dentistTenantId: getServiceOwnerScopeFromAppointment(anchorAppointment)?.serviceOwnerTenantId ?? tenantId,
      }
    );
    if (hasAvailabilityBlockConflict(conflictCheck.conflicts)) {
      throw new Error('AVAILABILITY_BLOCK_CONFLICT');
    }
    if (conflictCheck.hasConflict) {
      continue;
    }

    const nextRecurringId = await getNextNumericId('appointments');
    const nowIso = new Date().toISOString();
    toInsertDocs.push({
      id: nextRecurringId,
      _id: nextRecurringId,
      tenant_id: tenantId,
      user_id: anchorAppointment.user_id,
      calendar_id: anchorAppointment.calendar_id || null,
      created_by_user_id: anchorAppointment.created_by_user_id || null,
      dentist_db_user_id: anchorAppointment.dentist_db_user_id || null,
      dentist_id: anchorAppointment.dentist_id || null,
      service_owner_user_id: anchorAppointment.service_owner_user_id || anchorAppointment.user_id,
      service_owner_tenant_id: anchorAppointment.service_owner_tenant_id || tenantId,
      conversation_id: anchorAppointment.conversation_id || null,
      service_id: anchorAppointment.service_id,
      service_name: anchorAppointment.service_name || null,
      client_id: anchorAppointment.client_id || null,
      client_name: anchorAppointment.client_name || null,
      client_email: anchorAppointment.client_email || null,
      client_phone: anchorAppointment.client_phone || null,
      start_time: desired.start.toISOString(),
      end_time: desired.end.toISOString(),
      status: 'scheduled',
      category: anchorAppointment.category || null,
      category_label: anchorAppointment.category_label || null,
      category_color: anchorAppointment.category_color || null,
      color: anchorAppointment.color || null,
      notes: anchorAppointment.notes || null,
      price_at_time: anchorAppointment.price_at_time ?? null,
      recurrence: anchorAppointment.recurrence,
      recurrence_group_id: anchorAppointment.recurrence_group_id,
      reminder_sent: false,
      created_at: nowIso,
      updated_at: nowIso,
    });
  }

  const session = db.client.startSession();
  try {
    await session.withTransaction(async () => {
      if (toDeleteIds.length > 0) {
        const nowIso = new Date().toISOString();
        await db.collection('appointments').updateMany(
          { id: { $in: toDeleteIds }, tenant_id: tenantId, deleted_at: { $exists: false } },
          { $set: { deleted_at: nowIso, updated_at: nowIso } },
          { session }
        );
      }

      if (toUpdateIds.length > 0) {
        await db.collection('appointments').updateMany(
          { id: { $in: toUpdateIds }, tenant_id: tenantId, deleted_at: { $exists: false } },
          {
            $set: {
              service_id: anchorAppointment.service_id,
              dentist_db_user_id: anchorAppointment.dentist_db_user_id || null,
              dentist_id: anchorAppointment.dentist_id || null,
              service_owner_user_id: anchorAppointment.service_owner_user_id || anchorAppointment.user_id,
              service_owner_tenant_id: anchorAppointment.service_owner_tenant_id || tenantId,
              service_name: anchorAppointment.service_name || null,
              client_id: anchorAppointment.client_id || null,
              client_name: anchorAppointment.client_name || null,
              client_email: anchorAppointment.client_email || null,
              client_phone: anchorAppointment.client_phone || null,
              category: anchorAppointment.category || null,
              category_label: anchorAppointment.category_label || null,
              category_color: anchorAppointment.category_color || null,
              color: anchorAppointment.color || null,
              notes: anchorAppointment.notes || null,
              recurrence: anchorAppointment.recurrence,
              recurrence_group_id: anchorAppointment.recurrence_group_id,
              updated_at: new Date().toISOString(),
            },
          },
          { session }
        );
      }

      for (const doc of toInsertDocs) {
        await db.collection('appointments').insertOne(doc, { session });
      }
    });
  } finally {
    await session.endSession();
  }

  return;
}

// DELETE /api/appointments/[id] - Delete appointment
export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const auth = await getAuthUser();
    const { userId, dbUserId } = auth;
    const limited = await checkUpdateRateLimit(userId);
    if (limited) return limited;
    const db = await getMongoDbOrThrow();
    const appointmentId = Number(params.id);

    if (Number.isNaN(appointmentId)) {
      return createErrorResponse('Invalid appointment ID', 400);
    }

    const existingAppointment = await db.collection('appointments').findOne(
      {
        id: appointmentId,
        deleted_at: { $exists: false },
      }
    );
    if (!existingAppointment) {
      return createErrorResponse('Appointment not found', 404);
    }

    if (typeof existingAppointment.calendar_id === 'number') {
      const calendarAuth = await getCalendarAuth(auth, existingAppointment.calendar_id);
      if (!canDeleteAppointment(calendarAuth, existingAppointment as any, dbUserId)) {
        return createErrorResponse('Not authorized to delete this appointment', 403);
      }
    } else if (!matchesLegacyAppointmentOwner(existingAppointment, auth)) {
      return createErrorResponse('Not found or not authorized', 404);
    }

    const result = await db.collection('appointments').updateOne(
      appointmentMutationFilter(appointmentId, existingAppointment),
      {
        $set: {
          deleted_at: new Date().toISOString(),
          deleted_by: userId,
          updated_at: new Date().toISOString(),
        },
      }
    );
    if (result.matchedCount === 0) {
      return createErrorResponse('Not found or not authorized', 404);
    }

    // Optional bulk delete: when `?scope=series` is passed and the anchor is
    // part of a recurring series, soft-delete every other instance in the
    // group. Authorization is established via the anchor delete above; all
    // instances in a recurrence_group share calendar_id/user_id/tenant_id by
    // construction (see /api/appointments/recurring), so anchor permission is
    // sufficient. Single-delete (no scope) remains the default behaviour.
    const url = new URL(request.url);
    const scope = url.searchParams.get('scope');
    let seriesDeletedCount = 0;
    if (scope === 'series' && existingAppointment.recurrence_group_id) {
      const seriesResult = await db.collection('appointments').updateMany(
        {
          tenant_id: existingAppointment.tenant_id,
          recurrence_group_id: existingAppointment.recurrence_group_id,
          deleted_at: { $exists: false },
          id: { $ne: appointmentId },
        },
        {
          $set: {
            deleted_at: new Date().toISOString(),
            deleted_by: userId,
            updated_at: new Date().toISOString(),
          },
        }
      );
      seriesDeletedCount = seriesResult.modifiedCount;
    }

    if (typeof existingAppointment.client_id === 'number') {
      const clientScope = getServiceOwnerScopeFromAppointment(existingAppointment);
      await updateClientStats(
        existingAppointment.client_id,
        clientScope?.serviceOwnerTenantId ?? existingAppointment.tenant_id
      );
    }
    await invalidateReadCaches({
      tenantId: existingAppointment.tenant_id,
      userId: existingAppointment.user_id,
      calendarId: typeof existingAppointment.calendar_id === 'number' ? existingAppointment.calendar_id : undefined,
    });
    return NextResponse.json({ seriesDeletedCount: seriesDeletedCount + 1 }, { status: 200 });
  } catch (error) {
    return handleApiError(error, 'Failed to delete appointment');
  }
}
